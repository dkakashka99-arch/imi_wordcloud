import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'МИР · Облако слов',description:'Живые ответы. Общий взгляд на будущее.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="ru"><body>{children}</body></html>;}
