//! Pages servies par le serveur lui-même : connexion, administration des comptes, erreurs.

pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn document(titre: &str, corps: &str) -> String {
    format!(
        "<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
         <meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"color-scheme\" content=\"light dark\">\n\
         <title>{} · VGC Meta Overview</title>\n<link rel=\"icon\" href=\"data:,\">\n\
         <link rel=\"stylesheet\" href=\"/theme.css\">\n</head>\n<body class=\"vgc-auth\">\n{corps}\n</body>\n</html>\n",
        esc(titre)
    )
}

pub fn login(suite: &str, pseudo: &str, erreur: Option<&str>) -> String {
    let erreur = erreur
        .map(|e| format!("<p class=\"vgc-erreur\" role=\"alert\">{}</p>", esc(e)))
        .unwrap_or_default();
    document(
        "Connexion",
        &format!(
            "<main class=\"vgc-carte\">\n<h1>VGC Meta Overview</h1>\n\
             <p class=\"vgc-sous\">Accès réservé, sur invitation.</p>\n{erreur}\n\
             <form method=\"post\" action=\"/login\" class=\"vgc-form\">\n\
             <input type=\"hidden\" name=\"suite\" value=\"{}\">\n\
             <label for=\"pseudo\">Pseudo</label>\n\
             <input id=\"pseudo\" name=\"pseudo\" autocomplete=\"username\" autocapitalize=\"none\" spellcheck=\"false\" required value=\"{}\"{}>\n\
             <label for=\"mot_de_passe\">Mot de passe</label>\n\
             <input id=\"mot_de_passe\" name=\"mot_de_passe\" type=\"password\" autocomplete=\"current-password\" required{}>\n\
             <button type=\"submit\">Se connecter</button>\n</form>\n</main>",
            esc(suite),
            esc(pseudo),
            if pseudo.is_empty() { " autofocus" } else { "" },
            if pseudo.is_empty() { "" } else { " autofocus" },
        ),
    )
}

pub fn too_many_attempts() -> String {
    document(
        "Trop de tentatives",
        "<main class=\"vgc-carte\">\n<h1>Trop de tentatives</h1>\n\
         <p class=\"vgc-sous\">Trop d'essais de connexion ratés. Réessaie dans un quart d'heure.</p>\n\
         <p><a href=\"/login\">Retour à la connexion</a></p>\n</main>",
    )
}

pub fn simple(titre: &str, message: &str) -> String {
    document(
        titre,
        &format!(
            "<main class=\"vgc-carte\">\n<h1>{}</h1>\n<p class=\"vgc-sous\">{}</p>\n<p><a href=\"/\">Retour au tableau de bord</a></p>\n</main>",
            esc(titre),
            esc(message)
        ),
    )
}

/// Barre du compte connecté, au-dessus du tableau de bord.
pub fn account_bar(pseudo: &str, admin: bool) -> String {
    format!(
        "<nav class=\"vgc-compte\" aria-label=\"Compte\">\n<span>Connecté : <b>{}</b></span>\n{}\
         <form method=\"post\" action=\"/logout\"><button type=\"submit\">Se déconnecter</button></form>\n</nav>",
        esc(pseudo),
        if admin {
            "<a href=\"/admin/compte\">Comptes</a>\n"
        } else {
            ""
        }
    )
}

/// Page d'administration : prépare la ligne d'un compte à ajouter à VGC_USERS.
pub fn admin(pseudos: &[&str], erreur: Option<&str>, ligne: Option<&str>, pseudo_saisi: &str) -> String {
    let liste = if pseudos.is_empty() {
        "aucun".to_string()
    } else {
        pseudos
            .iter()
            .map(|p| format!("<b>{}</b>", esc(p)))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let erreur = erreur
        .map(|e| format!("<p class=\"vgc-erreur\" role=\"alert\">{}</p>", esc(e)))
        .unwrap_or_default();
    let resultat = ligne
        .map(|l| {
            format!(
                "<section class=\"vgc-resultat\">\n<h2>Ligne du compte</h2>\n<pre>{}</pre>\n\
                 <ol>\n<li>Ajoute cette ligne à la variable <code>VGC_USERS</code> du dépôt (GitHub, Settings, \
                 Secrets and variables, Actions, onglet Variables), une ligne par compte. Pour changer le mot de \
                 passe d'un compte existant, remplace sa ligne.</li>\n\
                 <li>Relance le workflow <b>Site</b> (onglet Actions, Run workflow) : le compte est actif après le \
                 déploiement.</li>\n<li>Transmets le mot de passe à ton ami par un canal privé.</li>\n</ol>\n\
                 <p class=\"vgc-sous\">Rien n'est enregistré ici : le serveur ne garde ni le mot de passe ni la ligne.</p>\n</section>",
                esc(l)
            )
        })
        .unwrap_or_default();
    document(
        "Comptes",
        &format!(
            "<main class=\"vgc-carte vgc-large\">\n<h1>Comptes</h1>\n<p class=\"vgc-sous\">Comptes actifs : {liste}.</p>\n{erreur}\n\
             <form method=\"post\" action=\"/admin/compte\" class=\"vgc-form\" autocomplete=\"off\">\n\
             <label for=\"pseudo\">Pseudo du compte</label>\n\
             <input id=\"pseudo\" name=\"pseudo\" required autocapitalize=\"none\" spellcheck=\"false\" \
             minlength=\"2\" maxlength=\"32\" value=\"{}\">\n\
             <label for=\"mot_de_passe\">Mot de passe (10 caractères au moins)</label>\n\
             <input id=\"mot_de_passe\" name=\"mot_de_passe\" type=\"password\" autocomplete=\"new-password\" required minlength=\"10\">\n\
             <label for=\"confirmation\">Confirmation</label>\n\
             <input id=\"confirmation\" name=\"confirmation\" type=\"password\" autocomplete=\"new-password\" required minlength=\"10\">\n\
             <button type=\"submit\">Préparer le compte</button>\n</form>\n{resultat}\n\
             <p><a href=\"/\">Retour au tableau de bord</a></p>\n</main>",
            esc(pseudo_saisi)
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echappement() {
        assert_eq!(
            esc("<a href=\"x\">'&'</a>"),
            "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
        );
        assert!(login("/\"><script>", "", None).contains("value=\"/&quot;&gt;&lt;script&gt;\""));
    }
}
