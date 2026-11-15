//! Comptes créés à la main : pas d'inscription, seulement des empreintes Argon2id dans VGC_USERS.

use std::collections::{HashMap, HashSet};

use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash};

pub struct Users {
    hashes: HashMap<String, String>,
    admins: HashSet<String>,
    /// Empreinte vérifiée quand le pseudo n'existe pas, pour que la réponse prenne le même temps.
    dummy: String,
}

impl Users {
    /// Lit VGC_USERS : une entrée « pseudo:empreinte » par ligne (ou séparée par « ; »),
    /// lignes vides et commentaires « # » ignorés.
    pub fn parse(raw: &str, admins: &[String]) -> Result<Users, String> {
        let mut hashes = HashMap::new();
        for (n, line) in raw.split(['\n', ';']).map(str::trim).enumerate() {
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let (pseudo, hash) = line
                .split_once(':')
                .ok_or_else(|| format!("VGC_USERS, entrée {} : format attendu pseudo:empreinte", n + 1))?;
            let pseudo = pseudo.trim();
            if !valid_pseudo(pseudo) {
                return Err(format!(
                    "VGC_USERS, entrée {} : pseudo invalide (2 à 32 caractères : lettres, chiffres, . _ -)",
                    n + 1
                ));
            }
            let hash = hash.trim();
            if PasswordHash::new(hash).is_err() || !hash.starts_with("$argon2id$") {
                return Err(format!("VGC_USERS, entrée {} : empreinte Argon2id illisible", n + 1));
            }
            if hashes.insert(pseudo.to_string(), hash.to_string()).is_some() {
                return Err(format!("VGC_USERS, entrée {} : pseudo déjà présent plus haut", n + 1));
            }
        }
        let dummy = hash_password("mot de passe factice, jamais accepté")?;
        Ok(Users {
            hashes,
            admins: admins.iter().cloned().collect(),
            dummy,
        })
    }

    /// Vérifie un mot de passe, en temps comparable que le pseudo existe ou non.
    pub fn verify(&self, pseudo: &str, password: &str) -> bool {
        match self.hashes.get(pseudo) {
            Some(hash) => check(hash, password),
            None => {
                let _ = check(&self.dummy, password);
                false
            }
        }
    }

    pub fn exists(&self, pseudo: &str) -> bool {
        self.hashes.contains_key(pseudo)
    }

    pub fn is_admin(&self, pseudo: &str) -> bool {
        self.exists(pseudo) && self.admins.contains(pseudo)
    }

    pub fn len(&self) -> usize {
        self.hashes.len()
    }

    /// Pseudos par ordre alphabétique (page d'administration).
    pub fn pseudos(&self) -> Vec<&str> {
        let mut v: Vec<&str> = self.hashes.keys().map(String::as_str).collect();
        v.sort_unstable();
        v
    }

    /// Administrateurs déclarés dans VGC_ADMIN mais sans compte.
    pub fn admins_without_account(&self) -> Vec<&str> {
        self.admins
            .iter()
            .filter(|a| !self.exists(a))
            .map(String::as_str)
            .collect()
    }
}

/// Empreinte Argon2id (paramètres par défaut de la bibliothèque) d'un mot de passe, sel aléatoire.
pub fn hash_password(password: &str) -> Result<String, String> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| format!("calcul de l'empreinte impossible : {e}"))
}

fn check(hash: &str, password: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

/// Pseudo de 2 à 32 caractères : lettres ASCII, chiffres, point, tiret et tiret bas.
pub fn valid_pseudo(p: &str) -> bool {
    (2..=32).contains(&p.len())
        && p.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Exigences minimales d'un mot de passe choisi pour un ami.
pub fn password_problem(password: &str) -> Option<&'static str> {
    if password.chars().count() < 10 {
        Some("Le mot de passe doit faire au moins 10 caractères.")
    } else if password.len() > 256 {
        Some("Le mot de passe est trop long.")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empreinte_puis_verification() {
        let h = hash_password("correct horse battery").unwrap();
        let users = Users::parse(&format!("# amis\nkarl:{h}\n\n"), &["karl".into()]).unwrap();
        assert_eq!(users.len(), 1);
        assert!(users.verify("karl", "correct horse battery"));
        assert!(!users.verify("karl", "mauvais"));
        assert!(!users.verify("inconnu", "correct horse battery"));
        assert!(users.is_admin("karl"));
    }

    #[test]
    fn separateur_point_virgule_et_erreurs() {
        let h = hash_password("un mot de passe").unwrap();
        assert_eq!(Users::parse(&format!("a1:{h};b2:{h}"), &[]).unwrap().len(), 2);
        assert!(Users::parse("karl", &[]).is_err());
        assert!(Users::parse("karl:pas-une-empreinte", &[]).is_err());
        assert!(Users::parse(&format!("k:{h}"), &[]).is_err());
        assert!(Users::parse(&format!("karl:{h}\nkarl:{h}"), &[]).is_err());
    }

    #[test]
    fn administrateur_sans_compte() {
        let users = Users::parse("", &["karl".into()]).unwrap();
        assert!(!users.is_admin("karl"));
        assert_eq!(users.admins_without_account(), vec!["karl"]);
    }

    #[test]
    fn pseudos_valides() {
        assert!(valid_pseudo("karl"));
        assert!(valid_pseudo("joestar.dragona_2"));
        assert!(!valid_pseudo("k"));
        assert!(!valid_pseudo("karl akpovi"));
        assert!(!valid_pseudo("karl|1"));
        assert!(!valid_pseudo("élodie"));
    }
}
