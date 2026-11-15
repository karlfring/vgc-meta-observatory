//! Session dans un cookie chiffré et authentifié (AES-256-GCM), sans base de données :
//! le serveur peut redémarrer ou s'éteindre (Cloud Run) sans déconnecter personne.

use axum_extra::extract::cookie::{Cookie, PrivateCookieJar, SameSite};

pub const COOKIE: &str = "vgc_session";
/// Durée d'une session : 30 jours.
pub const DUREE: i64 = 30 * 24 * 3600;
/// Une session renouvelée quand il lui reste moins de 20 jours : un ami qui revient garde sa connexion.
const RENOUVELLEMENT: i64 = 20 * 24 * 3600;

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Cookie de session : « pseudo|échéance », chiffré par la clé du serveur.
pub fn cookie(pseudo: &str, now: i64, secure: bool) -> Cookie<'static> {
    Cookie::build((COOKIE, format!("{pseudo}|{}", now + DUREE)))
        .path("/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::seconds(DUREE))
        .build()
}

/// Cookie qui efface la session côté navigateur.
pub fn removal() -> Cookie<'static> {
    Cookie::build((COOKIE, "")).path("/").build()
}

/// Pseudo et échéance d'une session valide, non expirée.
pub fn read(jar: &PrivateCookieJar, now: i64) -> Option<(String, i64)> {
    let value = jar.get(COOKIE)?.value().to_string();
    let (pseudo, exp) = value.rsplit_once('|')?;
    let exp: i64 = exp.parse().ok()?;
    (exp > now && !pseudo.is_empty()).then(|| (pseudo.to_string(), exp))
}

pub fn needs_renewal(exp: i64, now: i64) -> bool {
    exp - now < RENOUVELLEMENT
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_extra::extract::cookie::Key;

    #[test]
    fn aller_retour_et_expiration() {
        let key = Key::derive_from(&[7u8; 32]);
        let jar = PrivateCookieJar::new(key.clone()).add(cookie("karl", 1_000, true));
        assert_eq!(read(&jar, 1_000), Some(("karl".into(), 1_000 + DUREE)));
        assert_eq!(read(&jar, 1_000 + DUREE), None);
        assert!(!needs_renewal(1_000 + DUREE, 1_000));
        assert!(needs_renewal(1_000 + DUREE, 1_000 + 11 * 24 * 3600));
    }

    #[test]
    fn autre_cle_refusee() {
        let jar = PrivateCookieJar::new(Key::derive_from(&[7u8; 32])).add(cookie("karl", 1_000, true));
        let c = jar.get(COOKIE).unwrap();
        // le même cookie, présenté à un serveur qui a une autre clé, n'est pas déchiffrable
        let other = PrivateCookieJar::new(Key::derive_from(&[8u8; 32]));
        assert!(other.decrypt(c).is_none());
    }
}
