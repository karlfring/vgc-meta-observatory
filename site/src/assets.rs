//! Fichiers servis par le site, chargés en mémoire au démarrage : la page du tableau de bord
//! (assemblée une fois pour toutes), les scripts et styles, les données du mois et celles du calculateur.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use axum::body::Bytes;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha256};

/// Fichier prêt à servir.
pub struct Asset {
    pub body: Bytes,
    pub content_type: &'static str,
    pub etag: String,
}

impl Asset {
    fn new(body: Vec<u8>, content_type: &'static str) -> Asset {
        let digest = Sha256::digest(&body);
        let etag = format!(
            "\"{}\"",
            digest.iter().take(12).map(|b| format!("{b:02x}")).collect::<String>()
        );
        Asset {
            body: Bytes::from(body),
            content_type,
            etag,
        }
    }
}

/// Jeux de données lus par la page (dash.data), et leur fichier dans le dépôt.
const DONNEES: [(&str, &str); 6] = [
    ("pokemon", "data/dashboard/pokemon.json"),
    ("instantanes", "data/dashboard/instantanes.json"),
    ("builds", "data/dashboard/builds.json"),
    ("coequipiers", "data/dashboard/coequipiers.json"),
    ("counters", "data/dashboard/counters.json"),
    ("calculateur", "calculateur/dist/champions_data.json"),
];

pub struct Site {
    page_head: String,
    page_tail: String,
    /// En-tête Content-Security-Policy de la page : ses scripts en ligne y sont autorisés par empreinte.
    pub page_csp: String,
    pub theme: Asset,
    pub statics: HashMap<String, Asset>,
    pub data: HashMap<String, Asset>,
    /// Scripts que la page appelle mais qui ne sont pas fournis (l'illustration d'en-tête, par exemple).
    pub missing_scripts: Vec<String>,
}

impl Site {
    pub fn load(root: &Path) -> Result<Site, String> {
        let read =
            |rel: &str| fs::read(root.join(rel)).map_err(|e| format!("{} illisible : {e}", root.join(rel).display()));

        // scripts et styles du dossier site/static, plus le moteur du calculateur
        let mut statics = HashMap::new();
        let dir = root.join("site/static");
        let entries = fs::read_dir(&dir).map_err(|e| format!("{} illisible : {e}", dir.display()))?;
        for entry in entries {
            let path = entry.map_err(|e| e.to_string())?.path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            if path.is_file()
                && !name.starts_with('.')
                && let Some(ct) = content_type(&name)
            {
                statics.insert(name, Asset::new(fs::read(&path).map_err(|e| e.to_string())?, ct));
            }
        }
        statics.insert(
            "calc-moteur.js".into(),
            Asset::new(
                read("calculateur/dist/calc-moteur.js")?,
                "text/javascript; charset=utf-8",
            ),
        );
        let theme = statics.remove("theme.css").ok_or("site/static/theme.css manquant")?;

        let mut data = HashMap::new();
        for (id, rel) in DONNEES {
            let body = read(rel)?;
            serde_json::from_slice::<serde_json::Value>(&body)
                .map_err(|e| format!("{rel} n'est pas du JSON valide : {e}"))?;
            data.insert(id.to_string(), Asset::new(body, "application/json"));
        }

        let fragment =
            String::from_utf8(read("site/page/index.html")?).map_err(|_| "site/page/index.html n'est pas en UTF-8")?;
        let page = transform(&fragment, &|name| statics.contains_key(name))?;
        let document = format!(
            "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n\
             <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
             <meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"color-scheme\" content=\"light dark\">\n\
             <title>VGC Meta Overview</title>\n<link rel=\"icon\" href=\"data:,\">\n\
             <link rel=\"stylesheet\" href=\"/theme.css\">\n\
             <script src=\"/static/d3.min.js\"></script>\n<script src=\"/static/dash-shim.js\"></script>\n\
             </head>\n<body>\n{BARRE}\n<div id=\"dash-root\">\n{}\n</div>\n</body>\n</html>\n",
            page.html,
            BARRE = "\u{0}BARRE\u{0}",
        );
        let (head, tail) = document
            .split_once("\u{0}BARRE\u{0}")
            .expect("repère de la barre du compte");
        for needed in ["d3.min.js", "dash-shim.js"] {
            if !statics.contains_key(needed) {
                return Err(format!("site/static/{needed} manquant"));
            }
        }
        let hashes: String = page.hashes.iter().map(|h| format!(" 'sha256-{h}'")).collect();
        Ok(Site {
            page_head: head.to_string(),
            page_tail: tail.to_string(),
            page_csp: format!(
                "default-src 'self'; script-src 'self'{hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; \
                 connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
            ),
            theme,
            statics,
            data,
            missing_scripts: page.removed,
        })
    }

    /// La page du tableau de bord, avec la barre du compte connecté.
    pub fn render_page(&self, barre: &str) -> String {
        let mut s = String::with_capacity(self.page_head.len() + barre.len() + self.page_tail.len());
        s.push_str(&self.page_head);
        s.push_str(barre);
        s.push_str(&self.page_tail);
        s
    }
}

pub struct Page {
    pub html: String,
    /// Empreintes SHA-256 (base64) des scripts en ligne, pour la Content-Security-Policy.
    pub hashes: Vec<String>,
    pub removed: Vec<String>,
}

/// Prépare la page du tableau de bord pour un navigateur ordinaire :
/// - les scripts externes pointent vers /static/, et ceux qui ne sont pas fournis sont retirés ;
/// - chaque script en ligne est enveloppé dans une fonction, car le tableau de bord d'origine exécute
///   chaque bloc dans sa propre portée (deux blocs y déclarent les mêmes constantes).
pub fn transform(fragment: &str, available: &dyn Fn(&str) -> bool) -> Result<Page, String> {
    let mut html = String::with_capacity(fragment.len() + 1024);
    let (mut hashes, mut removed) = (Vec::new(), Vec::new());
    let mut rest = fragment;
    while let Some(start) = rest.find("<script") {
        html.push_str(&rest[..start]);
        let tail = &rest[start..];
        let open_end = tail.find('>').ok_or("balise <script> non fermée")?;
        let tag = &tail[..=open_end];
        let close = tail.find("</script>").ok_or("</script> manquant")?;
        let inner = &tail[open_end + 1..close];
        match attribute(tag, "src") {
            Some(src) => {
                let plain = !src.is_empty()
                    && src
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
                if plain && available(src) {
                    html.push_str(&format!("<script src=\"/static/{src}\"></script>"));
                } else {
                    removed.push(src.to_string());
                }
            }
            None => {
                let code = format!("\n(function () {{\n{inner}\n}})();\n");
                hashes.push(STANDARD.encode(Sha256::digest(code.as_bytes())));
                html.push_str("<script>");
                html.push_str(&code);
                html.push_str("</script>");
            }
        }
        rest = &tail[close + "</script>".len()..];
    }
    html.push_str(rest);
    Ok(Page { html, hashes, removed })
}

fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let key = format!("{name}=\"");
    let i = tag.find(&key)? + key.len();
    let j = tag[i..].find('"')? + i;
    Some(&tag[i..j])
}

fn content_type(name: &str) -> Option<&'static str> {
    Some(match name.rsplit_once('.')?.1 {
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "txt" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scripts_externes_et_en_ligne() {
        let page = transform(
            "<style>a{}</style>\n<script src=\"a.js\"></script>\n<script src=\"art.js\"></script>\n<p>x</p>\n<script>\n  const x = 1;\n</script>",
            &|n| n == "a.js",
        )
        .unwrap();
        assert!(page.html.contains("<script src=\"/static/a.js\"></script>"));
        assert!(!page.html.contains("art.js"));
        assert_eq!(page.removed, vec!["art.js"]);
        assert!(
            page.html
                .contains("<script>\n(function () {\n\n  const x = 1;\n\n})();\n</script>")
        );
        let code = "\n(function () {\n\n  const x = 1;\n\n})();\n";
        assert_eq!(page.hashes, vec![STANDARD.encode(Sha256::digest(code.as_bytes()))]);
    }

    #[test]
    fn chemin_refuse() {
        let page = transform("<script src=\"../secret.js\"></script>", &|_| true).unwrap();
        assert_eq!(page.removed, vec!["../secret.js"]);
    }
}
