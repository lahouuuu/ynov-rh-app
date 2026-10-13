import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { FournisseurSession } from '../lib/session';
import { Coquille } from '../components/Coquille';

// Police Montserrat auto-hébergée (licence SIL OFL) : aucun appel externe au build ni à l'affichage.
const montserrat = localFont({
  src: './fonts/Montserrat-Variable.woff2',
  variable: '--font-montserrat',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ynov RH — Congés, absences et retards',
  description: 'Gestion des congés, absences et retards du personnel de Maroc Ynov Campus',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d1d1e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={montserrat.variable}>
      <body>
        <FournisseurSession>
          <Coquille>{children}</Coquille>
        </FournisseurSession>
      </body>
    </html>
  );
}
