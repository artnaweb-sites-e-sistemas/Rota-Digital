/** Próximos passos padrão (novas propostas e fallback na UI quando `nextSteps` está vazio). */
export const DEFAULT_PROPOSAL_NEXT_STEPS = [
  "Entrar em contato conosco, informar o plano escolhido e tirar as dúvidas que fizerem falta — assim alinhamos expectativas antes de avançar.",
  "Preencher o formulário de briefing e o contrato com os dados e autorizações necessários para formalizarmos o projeto.",
  "Realizar o pagamento inicial combinado e acompanhar o início da execução e os primeiros resultados.",
] as const;

export function defaultProposalNextStepsList(): string[] {
  return [...DEFAULT_PROPOSAL_NEXT_STEPS];
}
