//! Configuration lue dans l'environnement (Cloud Run, ou un terminal en local).

use std::env;
use std::path::{Path, PathBuf};

pub struct Config {
    /// Port d'écoute ; Cloud Run fournit PORT.
    pub port: u16,
    /// Racine du dépôt : site/, data/dashboard/ et calculateur/dist/ y sont cherchés.
    pub root: PathBuf,
    /// Secret des cookies de session (VGC_SESSION_KEY), 32 caractères au moins.
    pub session_secret: String,
    /// Comptes (VGC_USERS) : une ligne « pseudo:empreinte Argon2id » par compte.
    pub users_raw: String,
    /// Pseudos administrateurs (VGC_ADMIN), séparés par des virgules.
    pub admins: Vec<String>,
    /// Cookies réservés à HTTPS ; VGC_DEV=1 les autorise en HTTP, pour travailler en local.
    pub secure_cookie: bool,
}

impl Config {
    pub fn from_env() -> Result<Config, String> {
        let port = env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
        let root = match env::var("VGC_ROOT") {
            Ok(r) if !r.is_empty() => PathBuf::from(r),
            _ => detect_root(),
        };
        let session_secret = env::var("VGC_SESSION_KEY").map_err(|_| {
            "VGC_SESSION_KEY manquant : une chaîne aléatoire d'au moins 32 caractères (vgc-site new-key en génère une)".to_string()
        })?;
        if session_secret.len() < 32 {
            return Err("VGC_SESSION_KEY trop court : 32 caractères au moins".into());
        }
        Ok(Config {
            port,
            root,
            session_secret,
            users_raw: env::var("VGC_USERS").unwrap_or_default(),
            admins: split_list(&env::var("VGC_ADMIN").unwrap_or_default()),
            secure_cookie: env::var("VGC_DEV").map(|v| v != "1").unwrap_or(true),
        })
    }
}

/// Racine du dépôt : le dossier courant, ou son parent quand on lance le serveur depuis site/.
fn detect_root() -> PathBuf {
    for candidate in [".", ".."] {
        if Path::new(candidate).join("site/page/index.html").is_file() {
            return PathBuf::from(candidate);
        }
    }
    PathBuf::from(".")
}

pub fn split_list(raw: &str) -> Vec<String> {
    raw.split([',', ';', ' ', '\n'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}
