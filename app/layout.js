import './globals.css';

// Fonts load in the browser, so the admin still builds and runs when Google Fonts can't be reached.
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&display=swap';
const fontVars = {
  '--font-heading': "'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--font-body': "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
};

export const metadata = {
  title: 'Admin Panel - SikhAid Charitable Trust',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={fontVars}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
