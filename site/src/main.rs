//! Site privé de VGC Meta Overview : le tableau de bord du dépôt, derrière une connexion.
//!
//! vgc-site [serve]                     lance le serveur (configuration dans l'environnement, voir site/README.md)
//! vgc-site check                       vérifie configuration, comptes et fichiers, sans lancer le serveur
//! vgc-site hash-password <pseudo>      demande un mot de passe et affiche la ligne du compte pour VGC_USERS
//! vgc-site hash-password --stdin <pseudo>   lit le mot de passe sur l'entrée standard (déploiement)
//! vgc-site new-key                     affiche une clé de session aléatoire pour VGC_SESSION_KEY

mod assets;
mod config;
mod html;
mod limiter;
mod session;
mod users;
mod web;

use std::io::{self, BufRead};
use std::process::ExitCode;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_target(false)
        // pas de codes couleur dans les journaux de Cloud Run
        .with_ansi(std::io::IsTerminal::is_terminal(&std::io::stdout()))
        .init();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        None | Some("serve") => serve(),
        Some("check") => check(),
        Some("hash-password") => hash_password(&args[1..]),
        Some("new-key") => {
            println!(
                "{}",
                STANDARD.encode(axum_extra::extract::cookie::Key::generate().master())
            );
            Ok(())
        }
        Some(other) => Err(format!(
            "commande inconnue : {other} (serve, check, hash-password, new-key)"
        )),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("Erreur : {e}");
            ExitCode::FAILURE
        }
    }
}

fn serve() -> Result<(), String> {
    let cfg = config::Config::from_env()?;
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?
        .block_on(web::serve(cfg))
}

fn check() -> Result<(), String> {
    let cfg = config::Config::from_env()?;
    let state = web::build_state(&cfg)?;
    let s = &state.0;
    println!("racine : {}", cfg.root.display());
    // pas de pseudos ici : les journaux de GitHub Actions d'un dépôt public sont publics
    println!("comptes : {}", s.users.len());
    println!(
        "fichiers : {} scripts et styles, {} jeux de données",
        s.site.statics.len() + 1,
        s.site.data.len()
    );
    if !s.site.missing_scripts.is_empty() {
        println!(
            "scripts non fournis, retirés de la page : {}",
            s.site.missing_scripts.join(", ")
        );
    }
    let orphans = s.users.admins_without_account();
    if !orphans.is_empty() {
        return Err(format!(
            "{} administrateur(s) sans compte dans VGC_USERS",
            orphans.len()
        ));
    }
    Ok(())
}

fn hash_password(args: &[String]) -> Result<(), String> {
    let stdin = args.iter().any(|a| a == "--stdin");
    let pseudo = args
        .iter()
        .find(|a| !a.starts_with("--"))
        .ok_or("usage : vgc-site hash-password [--stdin] <pseudo>")?;
    if !users::valid_pseudo(pseudo) {
        return Err(
            "pseudo invalide : 2 à 32 caractères, lettres sans accent, chiffres, point, tiret ou tiret bas".into(),
        );
    }
    let password = if stdin {
        let mut line = String::new();
        io::stdin().lock().read_line(&mut line).map_err(|e| e.to_string())?;
        line.trim_end_matches(['\r', '\n']).to_string()
    } else {
        let first = rpassword::prompt_password("Mot de passe : ").map_err(|e| e.to_string())?;
        let second = rpassword::prompt_password("Confirmation : ").map_err(|e| e.to_string())?;
        if first != second {
            return Err("les deux mots de passe ne sont pas identiques".into());
        }
        first
    };
    if let Some(problem) = users::password_problem(&password) {
        return Err(problem.to_string());
    }
    println!("{pseudo}:{}", users::hash_password(&password)?);
    Ok(())
}
