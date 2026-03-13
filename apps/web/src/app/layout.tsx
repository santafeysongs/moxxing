import type { Metadata } from 'next';
import './globals.css';
import { Space_Grotesk, Unbounded, JetBrains_Mono } from 'next/font/google';
import { NavBar } from './nav';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600', '700'] });
const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', weight: ['300', '400', '500', '600', '700', '800', '900'] });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'MOXXING',
  description: 'Put anyone anywhere',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${unbounded.variable} ${jetbrains.variable}`}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
