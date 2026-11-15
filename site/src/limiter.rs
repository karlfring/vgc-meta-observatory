//! Limite les tentatives de connexion ratées, par adresse et pour l'ensemble du site.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const FENETRE: Duration = Duration::from_secs(15 * 60);
const PAR_ADRESSE: u32 = 10;
const AU_TOTAL: u32 = 100;

pub struct Limiter {
    par_adresse: Mutex<HashMap<String, (u32, Instant)>>,
    total: Mutex<(u32, Instant)>,
}

impl Default for Limiter {
    fn default() -> Self {
        Limiter {
            par_adresse: Mutex::new(HashMap::new()),
            total: Mutex::new((0, Instant::now())),
        }
    }
}

impl Limiter {
    /// Vrai si l'adresse peut encore essayer : moins de 10 échecs en 15 minutes, et moins de 100 pour tout le site.
    pub fn allowed(&self, adresse: &str) -> bool {
        let now = Instant::now();
        let total = self.total.lock().unwrap();
        if now.duration_since(total.1) < FENETRE && total.0 >= AU_TOTAL {
            return false;
        }
        drop(total);
        let map = self.par_adresse.lock().unwrap();
        match map.get(adresse) {
            Some((n, debut)) => now.duration_since(*debut) >= FENETRE || *n < PAR_ADRESSE,
            None => true,
        }
    }

    pub fn failure(&self, adresse: &str) {
        let now = Instant::now();
        {
            let mut total = self.total.lock().unwrap();
            if now.duration_since(total.1) >= FENETRE {
                *total = (0, now);
            }
            total.0 += 1;
        }
        let mut map = self.par_adresse.lock().unwrap();
        if map.len() > 10_000 {
            map.retain(|_, (_, debut)| now.duration_since(*debut) < FENETRE);
        }
        let e = map.entry(adresse.to_string()).or_insert((0, now));
        if now.duration_since(e.1) >= FENETRE {
            *e = (0, now);
        }
        e.0 += 1;
    }

    pub fn success(&self, adresse: &str) {
        self.par_adresse.lock().unwrap().remove(adresse);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dix_echecs_bloquent_l_adresse() {
        let l = Limiter::default();
        for _ in 0..PAR_ADRESSE {
            assert!(l.allowed("1.2.3.4"));
            l.failure("1.2.3.4");
        }
        assert!(!l.allowed("1.2.3.4"));
        assert!(l.allowed("5.6.7.8"));
        l.success("1.2.3.4");
        assert!(l.allowed("1.2.3.4"));
    }

    #[test]
    fn plafond_global() {
        let l = Limiter::default();
        for i in 0..AU_TOTAL {
            l.failure(&format!("10.0.0.{i}"));
        }
        assert!(!l.allowed("192.168.1.1"));
    }
}
