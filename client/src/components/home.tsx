import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DiscordIcon from '@ui/components/login/discord';
import { DISCORD_CLIENT_ID, REDIRECT_URI } from '../UI/components/login/util';
import styles from './home.module.css';

const ELTANIA_DISCORD_URL = 'https://discord.gg/ptJxyejwXt';
const authCodeUrl =
  import.meta.env.VITE_AUTH_CODE_URL?.trim() || '/api/auth/discord/code';

export const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Shadows of Eltania';
    const queryParamCode = new URLSearchParams(window.location.search).get('code');
    if (queryParamCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.toString());
      (async () => {
        const { user, token } = await fetch(authCodeUrl, {
          method: 'POST',
          body: JSON.stringify({
            code: queryParamCode,
            client_id: DISCORD_CLIENT_ID,
            redirect_uri: decodeURIComponent(REDIRECT_URI),
          }),
        })
          .then((r) => r.json())
          .catch((e) => {
            console.log('Error:', e);
            return {};
          });
        if (!user || !token) {
          navigate('/');
          return;
        }
        localStorage.setItem('requiem', JSON.stringify({ user, token }));
        // Will extend this to other server shortnames eventually
        sessionStorage.setItem('worldLogin', 'requiem');
        navigate('/play');
      })();
    }
  }, [navigate]);

  const openDiscord = () => {
    window.open(ELTANIA_DISCORD_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className={styles.app}>
      <div aria-hidden="true" className={styles.atmosphere} />
      <header className={styles.masthead}>
        <img
          alt=""
          className={styles.mastheadMark}
          src="/eltania/mark.svg"
        />
        <span>Shadows of Eltania</span>
        <span className={styles.mastheadRule} />
        <span className={styles.mastheadState}>In development</span>
      </header>

      <section aria-labelledby="eltania-title" className={styles.hero}>
        <p className={styles.eyebrow}>Elrador</p>
        <h1 className={styles.title} id="eltania-title">
          <span>Shadows of</span>
          Eltania
        </h1>
        <div className={styles.actions}>
          <Link className={`${styles.action} ${styles.actionPrimary}`} to="/play">
            <span>Play</span>
          </Link>
          <button
            className={`${styles.action} ${styles.actionSecondary}`}
            type="button"
            onClick={openDiscord}
          >
            <DiscordIcon color="white" size={18} />
            <span>Discord</span>
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Shadows of Eltania</span>
      </footer>
    </main>
  );
};
