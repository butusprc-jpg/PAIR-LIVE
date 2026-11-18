import './globals.css';
import {LanguageProvider} from '../lib/LanguageProvider';
export const metadata={title:'บ่อกุ้งเชียงใหม่',description:'บ่อกุ้งเชียงใหม่',icons:{icon:'/icon.png',apple:'/apple-icon.png'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body><LanguageProvider>{children}</LanguageProvider></body></html>}
