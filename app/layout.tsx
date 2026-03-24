import '@/styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'RouteBatch (Vrachtwagen B.V.)',
    description: 'Automatische batch planning en optimalisatie van routes.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="nl">
            <body>
                <main className="min-h-screen">
                    {children}
                </main>
            </body>
        </html>
    );
}
