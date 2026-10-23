export const dynamic='force-dynamic';
export function GET(){return Response.json({status:'ok',service:'mir-wordcloud',version:'0.1.0'},{headers:{'Cache-Control':'no-store'}});}
