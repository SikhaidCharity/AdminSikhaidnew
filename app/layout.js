import { Poppins, Inter } from 'next/font/google';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], display: 'swap', variable: '--font-heading', weight: ['400', '500', '600', '700', '800'] });
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body', weight: ['400', '500', '600', '700'] });

export const metadata = {
  title: 'Admin Panel - SikhAid Charitable Trust',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
