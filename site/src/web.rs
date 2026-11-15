//! Serveur web : routes, connexion, protection des pages et des données, en-têtes de sécurité.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::{ConnectInfo, FromRef, Path, Query, Request, State};
use axum::http::{Extensions, HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Extension, Form, Router};
use axum_extra::extract::cookie::{Key, PrivateCookieJar};
use serde::Deserialize;
use tower_http::compression::CompressionLayer;
use tracing::{info, warn};

use crate::assets::{Asset, Site};
use crate::config::Config;
use crate::html;
use crate::limiter::Limiter;
use crate::session;
use crate::users::{self, Users};

pub struct Inner {
    pub users: Users,
    pub key: Key,
    pub site: Site,
    pub limiter: Limiter,
    pub secure: bool,
}

#[derive(Clone)]
pub struct AppState(pub Arc<Inner>);

impl FromRef<AppState> for Key {
    fn from_ref(state: &AppState) -> Key {
        state.0.key.clone()
    }
}

/// Pseudo du compte connecté, posé par le contrôle de session.
#[derive(Clone)]
pub struct Utilisateur(pub String);

const CSP_FORMULAIRES: &str = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

pub fn build_state(cfg: &Config) -> Result<AppState, String> {
    let site = Site::load(&cfg.root)?;
    let users = Users::parse(&cfg.users_raw, &cfg.admins)?;
    Ok(AppState(Arc::new(Inner {
        users,
        key: Key::derive_from(cfg.session_secret.as_bytes()),
        site,
        limiter: Limiter::default(),
        secure: cfg.secure_cookie,
    })))
}

pub fn router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/", get(page))
        .route("/static/{file}", get(static_file))
        .route("/data/{file}", get(data_file))
        .route("/admin/compte", get(admin_form).post(admin_create))
        .route("/logout", post(logout))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_user));
    Router::new()
        .route("/login", get(login_page).post(login))
        .route("/theme.css", get(theme))
        .route("/sante", get(|| async { "ok" }))
        .merge(protected)
        .fallback(not_found)
        .layer(middleware::from_fn_with_state(state.clone(), security_headers))
        .layer(CompressionLayer::new())
        .with_state(state)
}

pub async fn serve(cfg: Config) -> Result<(), String> {
    let state = build_state(&cfg)?;
    let inner = &state.0;
    if inner.users.len() == 0 {
        warn!("aucun compte dans VGC_USERS : personne ne pourra se connecter");
    }
    for admin in inner.users.admins_without_account() {
        warn!("administrateur {admin} sans compte dans VGC_USERS");
    }
    if !inner.site.missing_scripts.is_empty() {
        info!(
            "scripts non fournis, retirés de la page : {}",
            inner.site.missing_scripts.join(", ")
        );
    }
    if !cfg.secure_cookie {
        warn!("VGC_DEV=1 : cookies de session acceptés en HTTP, à réserver au travail en local");
    }
    let addr = SocketAddr::from(([0, 0, 0, 0], cfg.port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("port {} indisponible : {e}", cfg.port))?;
    info!(
        "VGC Meta Overview sur le port {} : {} compte(s)",
        cfg.port,
        inner.users.len()
    );
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await
    .map_err(|e| e.to_string())
}

/// Arrêt propre sur Ctrl+C ou SIGTERM (envoyé par Cloud Run avant d'éteindre une instance).
async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
}

// ---------- connexion ----------

#[derive(Deserialize)]
struct LoginQuery {
    suite: Option<String>,
}

#[derive(Deserialize)]
struct LoginForm {
    pseudo: String,
    mot_de_passe: String,
    #[serde(default)]
    suite: String,
}

async fn login_page(State(st): State<AppState>, jar: PrivateCookieJar, Query(q): Query<LoginQuery>) -> Response {
    let suite = safe_next(q.suite.as_deref().unwrap_or("/"));
    if let Some((pseudo, _)) = session::read(&jar, session::now())
        && st.0.users.exists(&pseudo)
    {
        return Redirect::to(&suite).into_response();
    }
    form_page(StatusCode::OK, html::login(&suite, "", None))
}

async fn login(
    State(st): State<AppState>,
    headers: HeaderMap,
    ext: Extensions,
    jar: PrivateCookieJar,
    Form(f): Form<LoginForm>,
) -> Response {
    let adresse = client_address(&headers, &ext);
    let suite = safe_next(&f.suite);
    if !st.0.limiter.allowed(&adresse) {
        warn!("connexion refusée à {adresse} : trop de tentatives");
        return form_page(StatusCode::TOO_MANY_REQUESTS, html::too_many_attempts());
    }
    let pseudo = f.pseudo.trim().to_string();
    // Argon2 est volontairement lent : la vérification tourne hors de la boucle des requêtes
    let ok = {
        let (st2, p, pw) = (st.clone(), pseudo.clone(), f.mot_de_passe);
        tokio::task::spawn_blocking(move || st2.0.users.verify(&p, &pw))
            .await
            .unwrap_or(false)
    };
    let pseudo_journal = if users::valid_pseudo(&pseudo) {
        pseudo.as_str()
    } else {
        "(pseudo invalide)"
    };
    if ok {
        st.0.limiter.success(&adresse);
        info!("connexion de {pseudo_journal}");
        let jar = jar.add(session::cookie(&pseudo, session::now(), st.0.secure));
        (jar, Redirect::to(&suite)).into_response()
    } else {
        st.0.limiter.failure(&adresse);
        warn!("échec de connexion pour {pseudo_journal} depuis {adresse}");
        form_page(
            StatusCode::UNAUTHORIZED,
            html::login(&suite, &pseudo, Some("Pseudo ou mot de passe incorrect.")),
        )
    }
}

async fn logout(jar: PrivateCookieJar) -> Response {
    (jar.remove(session::removal()), Redirect::to("/login")).into_response()
}

/// Contrôle de session des routes protégées ; renouvelle la session d'un ami qui revient.
async fn require_user(State(st): State<AppState>, mut req: Request, next: Next) -> Response {
    let jar = PrivateCookieJar::from_headers(req.headers(), st.0.key.clone());
    let now = session::now();
    match session::read(&jar, now) {
        Some((pseudo, exp)) if st.0.users.exists(&pseudo) => {
            req.extensions_mut().insert(Utilisateur(pseudo.clone()));
            let mut resp = next.run(req).await;
            if session::needs_renewal(exp, now) {
                let renewed = jar.add(session::cookie(&pseudo, now, st.0.secure)).into_response();
                for value in renewed.headers().get_all(header::SET_COOKIE) {
                    resp.headers_mut().append(header::SET_COOKIE, value.clone());
                }
            }
            resp
        }
        _ => {
            let path = req.uri().path();
            if req.method() == Method::GET && (path == "/" || path.starts_with("/admin")) {
                let suite = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/");
                Redirect::to(&format!("/login?suite={}", urlencode(suite))).into_response()
            } else {
                (StatusCode::UNAUTHORIZED, "Connexion requise").into_response()
            }
        }
    }
}

// ---------- tableau de bord et fichiers ----------

async fn page(State(st): State<AppState>, Extension(u): Extension<Utilisateur>) -> Response {
    let barre = html::account_bar(&u.0, st.0.users.is_admin(&u.0));
    let mut resp = Html(st.0.site.render_page(&barre)).into_response();
    let h = resp.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Ok(csp) = HeaderValue::from_str(&st.0.site.page_csp) {
        h.insert(header::CONTENT_SECURITY_POLICY, csp);
    }
    resp
}

async fn theme(State(st): State<AppState>, headers: HeaderMap) -> Response {
    asset_response(&st.0.site.theme, &headers, "public, max-age=3600")
}

async fn static_file(State(st): State<AppState>, Path(file): Path<String>, headers: HeaderMap) -> Response {
    match st.0.site.statics.get(&file) {
        Some(a) => asset_response(a, &headers, "private, max-age=86400"),
        None => not_found().await,
    }
}

async fn data_file(State(st): State<AppState>, Path(file): Path<String>, headers: HeaderMap) -> Response {
    match file.strip_suffix(".json").and_then(|id| st.0.site.data.get(id)) {
        // données du mois : courte durée de cache, elles changent à chaque déploiement mensuel
        Some(a) => asset_response(a, &headers, "private, max-age=300"),
        None => not_found().await,
    }
}

fn asset_response(a: &Asset, headers: &HeaderMap, cache: &'static str) -> Response {
    let etag = HeaderValue::from_str(&a.etag).unwrap_or_else(|_| HeaderValue::from_static("\"\""));
    let fresh = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|t| t.trim() == a.etag));
    let mut resp = if fresh {
        StatusCode::NOT_MODIFIED.into_response()
    } else {
        a.body.clone().into_response()
    };
    let h = resp.headers_mut();
    if !fresh {
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static(a.content_type));
    }
    h.insert(header::ETAG, etag);
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    resp
}

async fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        Html(html::simple(
            "Page introuvable",
            "Cette adresse ne correspond à aucune page du site.",
        )),
    )
        .into_response()
}

// ---------- administration des comptes ----------

#[derive(Deserialize)]
struct AdminForm {
    pseudo: String,
    mot_de_passe: String,
    confirmation: String,
}

async fn admin_form(State(st): State<AppState>, Extension(u): Extension<Utilisateur>) -> Response {
    if !st.0.users.is_admin(&u.0) {
        return forbidden();
    }
    form_page(StatusCode::OK, html::admin(&st.0.users.pseudos(), None, None, ""))
}

async fn admin_create(
    State(st): State<AppState>,
    Extension(u): Extension<Utilisateur>,
    Form(f): Form<AdminForm>,
) -> Response {
    if !st.0.users.is_admin(&u.0) {
        return forbidden();
    }
    let pseudo = f.pseudo.trim().to_string();
    let pseudos = st.0.users.pseudos();
    let erreur = if !users::valid_pseudo(&pseudo) {
        Some("Pseudo invalide : 2 à 32 caractères, lettres sans accent, chiffres, point, tiret ou tiret bas.")
    } else if f.mot_de_passe != f.confirmation {
        Some("Les deux mots de passe ne sont pas identiques.")
    } else {
        users::password_problem(&f.mot_de_passe)
    };
    if let Some(e) = erreur {
        return form_page(StatusCode::BAD_REQUEST, html::admin(&pseudos, Some(e), None, &pseudo));
    }
    let pw = f.mot_de_passe;
    match tokio::task::spawn_blocking(move || users::hash_password(&pw)).await {
        Ok(Ok(hash)) => {
            info!("ligne de compte préparée pour {pseudo} par {}", u.0);
            form_page(
                StatusCode::OK,
                html::admin(&pseudos, None, Some(&format!("{pseudo}:{hash}")), &pseudo),
            )
        }
        _ => form_page(
            StatusCode::INTERNAL_SERVER_ERROR,
            html::admin(&pseudos, Some("Calcul de l'empreinte impossible."), None, &pseudo),
        ),
    }
}

fn forbidden() -> Response {
    form_page(
        StatusCode::FORBIDDEN,
        html::simple("Accès refusé", "Cette page est réservée à l'administrateur du site."),
    )
}

// ---------- utilitaires ----------

fn form_page(status: StatusCode, body: String) -> Response {
    let mut resp = (status, Html(body)).into_response();
    resp.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    resp
}

/// En-têtes communs à toutes les réponses.
async fn security_headers(State(st): State<AppState>, req: Request, next: Next) -> Response {
    let mut resp = next.run(req).await;
    let h = resp.headers_mut();
    let set = |h: &mut HeaderMap, name: HeaderName, value: &'static str| {
        h.insert(name, HeaderValue::from_static(value));
    };
    set(h, header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    set(h, header::X_FRAME_OPTIONS, "DENY");
    set(h, header::REFERRER_POLICY, "same-origin");
    set(h, HeaderName::from_static("x-robots-tag"), "noindex, nofollow");
    set(h, HeaderName::from_static("cross-origin-opener-policy"), "same-origin");
    set(
        h,
        HeaderName::from_static("permissions-policy"),
        "camera=(), microphone=(), geolocation=()",
    );
    if st.0.secure {
        set(h, header::STRICT_TRANSPORT_SECURITY, "max-age=31536000");
    }
    if !h.contains_key(header::CONTENT_SECURITY_POLICY) {
        set(h, header::CONTENT_SECURITY_POLICY, CSP_FORMULAIRES);
    }
    resp
}

/// Adresse du visiteur : la dernière entrée de X-Forwarded-For, ajoutée par le frontal de Cloud Run
/// (les précédentes peuvent venir du client), sinon l'adresse de la connexion.
fn client_address(headers: &HeaderMap, ext: &Extensions) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| ext.get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip().to_string()))
        .unwrap_or_else(|| "inconnue".into())
}

/// Adresse de retour après connexion : un chemin du site seulement, jamais un autre domaine.
fn safe_next(s: &str) -> String {
    let ok = s.starts_with('/')
        && !s.starts_with("//")
        && !s.starts_with("/\\")
        && s.len() <= 512
        && !s.chars().any(|c| c.is_control());
    if ok { s.to_string() } else { "/".into() }
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use tower::ServiceExt;

    fn state() -> AppState {
        let h = users::hash_password("mot de passe de test").unwrap();
        let cfg = Config {
            port: 0,
            root: std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/..")),
            session_secret: "une clé de test assez longue pour le cookie".into(),
            users_raw: format!("karl:{h}\nami:{h}"),
            admins: vec!["karl".into()],
            secure_cookie: true,
        };
        build_state(&cfg).unwrap()
    }

    async fn send(app: &Router, req: axum::http::Request<Body>) -> Response {
        app.clone().oneshot(req).await.unwrap()
    }

    fn get(uri: &str, cookie: Option<&str>) -> axum::http::Request<Body> {
        let mut b = axum::http::Request::get(uri);
        if let Some(c) = cookie {
            b = b.header(header::COOKIE, c);
        }
        b.body(Body::empty()).unwrap()
    }

    fn post_form(uri: &str, body: &str, cookie: Option<&str>) -> axum::http::Request<Body> {
        let mut b = axum::http::Request::post(uri).header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
        if let Some(c) = cookie {
            b = b.header(header::COOKIE, c);
        }
        b.body(Body::from(body.to_string())).unwrap()
    }

    async fn login_cookie(app: &Router, pseudo: &str) -> String {
        let r = send(
            app,
            post_form(
                "/login",
                &format!("pseudo={pseudo}&mot_de_passe=mot+de+passe+de+test&suite=%2F"),
                None,
            ),
        )
        .await;
        assert_eq!(r.status(), StatusCode::SEE_OTHER);
        let set = r.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap();
        assert!(set.contains("HttpOnly") && set.contains("Secure") && set.contains("SameSite=Lax"));
        set.split(';').next().unwrap().to_string()
    }

    #[tokio::test]
    async fn sans_session_tout_est_protege() {
        let app = router(state());
        let r = send(&app, get("/?pokemon=Kingambit", None)).await;
        assert_eq!(r.status(), StatusCode::SEE_OTHER);
        assert_eq!(r.headers()[header::LOCATION], "/login?suite=/%3Fpokemon%3DKingambit");
        for uri in [
            "/data/pokemon.json",
            "/data/calculateur.json",
            "/static/calc-moteur.js",
            "/static/d3.min.js",
        ] {
            assert_eq!(
                send(&app, get(uri, None)).await.status(),
                StatusCode::UNAUTHORIZED,
                "{uri}"
            );
        }
        assert_eq!(send(&app, get("/login", None)).await.status(), StatusCode::OK);
        assert_eq!(send(&app, get("/theme.css", None)).await.status(), StatusCode::OK);
        // un faux cookie ne passe pas
        assert_eq!(
            send(&app, get("/data/pokemon.json", Some("vgc_session=karl|99999999999")))
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn connexion_puis_tableau_de_bord() {
        let app = router(state());
        let bad = send(
            &app,
            post_form("/login", "pseudo=karl&mot_de_passe=faux&suite=%2F", None),
        )
        .await;
        assert_eq!(bad.status(), StatusCode::UNAUTHORIZED);
        let cookie = login_cookie(&app, "karl").await;
        let r = send(&app, get("/", Some(&cookie))).await;
        assert_eq!(r.status(), StatusCode::OK);
        let csp = r.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .to_string();
        assert!(csp.contains("'sha256-") && !csp.contains("unsafe-eval"));
        let body = String::from_utf8(to_bytes(r.into_body(), usize::MAX).await.unwrap().to_vec()).unwrap();
        assert!(
            body.contains("id=\"dash-root\"")
                && body.contains("Connecté : <b>karl</b>")
                && body.contains("/admin/compte")
        );
        assert!(body.contains("<script src=\"/static/calc-moteur.js\"></script>"));
        let d = send(&app, get("/data/pokemon.json", Some(&cookie))).await;
        assert_eq!(d.status(), StatusCode::OK);
        let etag = d.headers()[header::ETAG].to_str().unwrap().to_string();
        let mut req = get("/data/pokemon.json", Some(&cookie));
        req.headers_mut()
            .insert(header::IF_NONE_MATCH, HeaderValue::from_str(&etag).unwrap());
        assert_eq!(send(&app, req).await.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(
            send(&app, get("/data/inconnu.json", Some(&cookie))).await.status(),
            StatusCode::NOT_FOUND
        );
        // déconnexion : le cookie est effacé
        let out = send(&app, post_form("/logout", "", Some(&cookie))).await;
        assert_eq!(out.status(), StatusCode::SEE_OTHER);
        assert!(
            out.headers()[header::SET_COOKIE]
                .to_str()
                .unwrap()
                .starts_with("vgc_session=;")
        );
    }

    #[tokio::test]
    async fn administration_reservee() {
        let app = router(state());
        let ami = login_cookie(&app, "ami").await;
        assert_eq!(
            send(&app, get("/admin/compte", Some(&ami))).await.status(),
            StatusCode::FORBIDDEN
        );
        let karl = login_cookie(&app, "karl").await;
        let r = send(
            &app,
            post_form(
                "/admin/compte",
                "pseudo=nouvel.ami&mot_de_passe=assez+long+ok&confirmation=assez+long+ok",
                Some(&karl),
            ),
        )
        .await;
        assert_eq!(r.status(), StatusCode::OK);
        let body = String::from_utf8(to_bytes(r.into_body(), usize::MAX).await.unwrap().to_vec()).unwrap();
        let ligne = body.split("<pre>").nth(1).unwrap().split("</pre>").next().unwrap();
        assert!(ligne.starts_with("nouvel.ami:$argon2id$"));
        let refus = send(
            &app,
            post_form(
                "/admin/compte",
                "pseudo=x&mot_de_passe=court&confirmation=court",
                Some(&karl),
            ),
        )
        .await;
        assert_eq!(refus.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn trop_de_tentatives() {
        let app = router(state());
        for _ in 0..10 {
            let mut req = post_form("/login", "pseudo=karl&mot_de_passe=faux", None);
            req.headers_mut()
                .insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4, 9.9.9.9"));
            assert_eq!(send(&app, req).await.status(), StatusCode::UNAUTHORIZED);
        }
        let mut req = post_form("/login", "pseudo=karl&mot_de_passe=mot+de+passe+de+test", None);
        req.headers_mut()
            .insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4, 9.9.9.9"));
        assert_eq!(send(&app, req).await.status(), StatusCode::TOO_MANY_REQUESTS);
        // une autre adresse réelle (dernière entrée) peut toujours se connecter
        let mut req = post_form("/login", "pseudo=karl&mot_de_passe=mot+de+passe+de+test", None);
        req.headers_mut()
            .insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4, 8.8.8.8"));
        assert_eq!(send(&app, req).await.status(), StatusCode::SEE_OTHER);
    }

    #[test]
    fn retour_apres_connexion() {
        assert_eq!(safe_next("/?pokemon=X#y"), "/?pokemon=X#y");
        assert_eq!(safe_next("//exemple.com"), "/");
        assert_eq!(safe_next("https://exemple.com"), "/");
        assert_eq!(safe_next("/\\exemple.com"), "/");
    }
}
