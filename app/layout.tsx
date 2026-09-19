import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'] });

export const metadata = {
  title: 'Application de gestion RH - Ynov',
  description: 'Gestion des congés, absences et retards',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={montserrat.className}>{children}</body>
    </html>
  );
}