/**
 * Trecho de instrução de tom/voz para relatórios (Gemini).
 * Alinhado a princípios de copy clara (clareza, benefício, linguagem do leitor)
 * e revisão para clareza/voz, sem jargão de agência.
 */
export function buildReportCopyVoicePromptSection(): string {
  return `**Voz do relatório (leitor: dono de negócio comum)**
- O texto precisa ser **gostoso de ler**: leve, direto, fácil de entender — sem “preguiça” de leitura (evite blocos densos, frases enormes e tom professoral).
- **Clareza em primeiro lugar**: frases preferencialmente curtas; voz ativa quando couber; **uma ideia principal** por frase ou trecho curto.
- **Profissional e humano**: confiante e cordial, sem soar como palestra de marketing nem como consultoria que tenta impressionar.
- Conecte o que você observa (site, Instagram, capturas) ao **que isso significa na prática** para o negócio (sem inventar dados).

**Sem jargão de agência / mídia — diga em português simples**
Nos textos corridos do JSON (resumos, comentários de nota, listas, descrições de canal, notas de pesquisa, HTML da proposta), **não use** siglas nem termos técnicos de marketing, por exemplo: SEO, SEM, SERP, CPC, CPM, ROI, CRM, CDP, UX, UI, LTV, funnel, growth, performance, **tráfego pago**, **mídia paga**, remarketing, **retargeting**, **awareness**, lookalike, **lead** (prefira “contato”, “pessoa interessada”), **landing** (prefira “página de contato” ou “página de destino”), **conversão** (prefira “fechar venda”, “gerar mais contatos” ou “mais pedidos”, conforme o caso), **engajamento** (prefira “interação”, “retorno do público”), **criativo** (prefira “arte do anúncio”, “imagem do anúncio”), **copy** (prefira “texto do site” ou “texto do anúncio”), briefing, **CTA** (prefira “botão para falar com vocês”, “convite para contato”, “chamada para agendar”).
Se precisar do conceito, **traduza** em linguagem do dia a dia (ex.: “aparecer bem quando alguém pesquisa no Google” em vez de “SEO”; “anúncios pagos no Instagram ou Facebook” em vez de “tráfego pago”).

**Revisão leve (anti-vacuidade)**
- Prefira detalhes observáveis a elogios genéricos (“a página inicial explica o serviço em poucas linhas” vence “comunicação sólida”).
- Evite empilhar substantivos vazios (“otimização estratégica de resultados”, “potencialização de performance”).
- Não abra várias frases seguidas com “Além disso”, “Ademais”, “De fato”, “Nesse sentido”.
- Varie um pouco o comprimento das frases para o texto não ficar monótono.
`;
}
