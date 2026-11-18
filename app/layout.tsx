import './globals.css';
import {LanguageProvider} from '../lib/LanguageProvider';
export const metadata={title:'PAIR LIVE',description:'Live round experience'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body><LanguageProvider>{children}</LanguageProvider></body></html>}
