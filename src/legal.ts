/**
 * Textos legais exibidos no app. A mesma versão deve ser publicada numa página web
 * (exigência do Google Play) — veja docs/PRIVACIDADE.md e docs/TERMOS.md.
 *
 * ⚠️ Preencha os campos entre colchetes e revise com um profissional jurídico antes de publicar.
 * Ao alterar o conteúdo, mude TERMS_VERSION (src/lib/env.ts) e accept_terms() no banco:
 * todos os usuários serão convidados a aceitar de novo.
 */
export const LEGAL_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Resumo',
    body:
      'O Território registra suas corridas pelo GPS do celular para somar quilômetros em regiões do mapa. ' +
      'Quem corre mais em uma região durante o mês é o dono dela. Outros usuários veem apenas o seu nome, ' +
      'a sua cor e quantos km você somou em cada região — nunca o seu trajeto.',
  },
  {
    title: '1. Quem é o controlador dos dados',
    body:
      '[NOME / RAZÃO SOCIAL], [CPF/CNPJ], [endereço]. Encarregado (DPO): [nome], e-mail [e-mail do encarregado].',
  },
  {
    title: '2. Quais dados coletamos',
    body:
      '• Da sua conta Google: nome, e-mail, foto de perfil e um identificador da conta.\n' +
      '• Das corridas: pontos de localização (latitude, longitude, horário e precisão) coletados SOMENTE ' +
      'enquanto você grava uma corrida, com uma notificação visível na tela.\n' +
      '• Dados derivados: distância, duração e km somados em cada território.\n' +
      'Não coletamos localização fora das corridas, nem contatos, fotos, microfone ou dados de saúde.',
  },
  {
    title: '3. Para que usamos',
    body:
      '• Calcular a distância das suas corridas e os km em cada território (execução do contrato, art. 7º, V, LGPD).\n' +
      '• Montar os rankings mensais visíveis aos demais usuários.\n' +
      '• Prevenir fraudes (por exemplo, km registrados de carro), com base no legítimo interesse (art. 7º, IX).\n' +
      'Não vendemos seus dados e não os usamos para publicidade.',
  },
  {
    title: '4. O que outros usuários veem',
    body:
      'Seu nome de exibição, foto, cor e os km somados em cada território no mês. O percurso das corridas e ' +
      'os horários ficam visíveis apenas para você.',
  },
  {
    title: '5. Onde os dados ficam e por quanto tempo',
    body:
      'Os dados são armazenados no Supabase (infraestrutura em nuvem), com acesso restrito por regras de segurança. ' +
      'Podem ser processados fora do Brasil, com as salvaguardas do art. 33 da LGPD. ' +
      'Mantemos seus dados enquanto a conta existir. Ao excluir a conta, tudo é apagado definitivamente.',
  },
  {
    title: '6. Seus direitos',
    body:
      'Você pode, a qualquer momento: acessar e corrigir seus dados (tela Perfil), excluir a conta e todos os dados ' +
      '(Perfil → Excluir conta), revogar este consentimento e pedir informações pelo e-mail do encarregado.',
  },
  {
    title: '7. Termos de uso',
    body:
      '• Use o app apenas para registrar corridas e caminhadas reais, feitas por você.\n' +
      '• É proibido usar veículos, GPS falso ou qualquer meio para inflar a distância. Corridas suspeitas são ' +
      'recusadas automaticamente e contas que fraudarem podem ser excluídas.\n' +
      '• Corra com segurança: respeite o trânsito, não use o celular enquanto atravessa ruas e não entre em ' +
      'propriedades privadas ou áreas de risco para conquistar territórios.\n' +
      '• O app é oferecido "no estado em que se encontra"; não nos responsabilizamos por lesões, acidentes ' +
      'ou danos decorrentes da prática esportiva.\n' +
      '• Nomes de exibição ofensivos podem ser alterados ou removidos.\n' +
      '• Foro: comarca de [cidade/UF].',
  },
];
