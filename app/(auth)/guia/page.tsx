'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Headset,
  LogIn,
  MessageSquare,
  Settings,
  Shield,
  Star,
  Ticket,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SigmaLogo } from '@/components/sigma-logo';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as const },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */
function Section({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 px-5 py-16 sm:px-8 md:py-24 ${className}`}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={fadeUp}
      custom={0}
      className="mb-12 text-center"
    >
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{children}</h2>
      {sub && <p className="mt-3 text-sm text-muted-foreground sm:text-base">{sub}</p>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature card                                                       */
/* ------------------------------------------------------------------ */
function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
      custom={index}
      className="group relative rounded-2xl border border-border/50 bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r opacity-60 transition-opacity group-hover:opacity-100"
        style={{ backgroundImage: `linear-gradient(to right, ${color}, ${color}88)` }}
      />
      <div
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
        style={{ backgroundColor: `${color}15` }}
      >
        <span style={{ color }}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step card (how it works)                                           */
/* ------------------------------------------------------------------ */
function StepCard({
  step,
  title,
  description,
  icon: Icon,
  index,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  index: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
      custom={index}
      className="relative flex gap-4"
    >
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-sm font-bold text-white shadow-md shadow-indigo-500/20">
          {step}
        </div>
        {step < 5 && (
          <div className="mt-2 h-full w-px bg-gradient-to-b from-indigo-300 to-transparent" />
        )}
      </div>
      <div className="pb-10">
        <div className="mb-1 flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-600" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Role card                                                          */
/* ------------------------------------------------------------------ */
function RoleCard({
  title,
  description,
  features,
  icon: Icon,
  color,
  index,
}: {
  title: string;
  description: string;
  features: string[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
      custom={index}
      className="group rounded-2xl border border-border/50 bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
        style={{ backgroundColor: `${color}15` }}
      >
        <span style={{ color }}>
          <Icon className="h-6 w-6" />
        </span>
      </div>
      <h3 className="mb-1 text-lg font-semibold">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ Accordion                                                      */
/* ------------------------------------------------------------------ */
function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
      custom={index}
      className="rounded-xl border border-border/50 bg-card"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium transition-colors hover:text-indigo-600"
      >
        {q}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="overflow-hidden px-5 pb-4"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation header                                                  */
/* ------------------------------------------------------------------ */
function GuideHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-xl dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
        <Link href="/guia" className="flex items-center gap-3">
          <SigmaLogo size={36} />
          <div>
            <span className="text-lg font-bold tracking-tight">Sigma</span>
            <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
              Guia do Usuário
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a
            href="#recursos"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Recursos
          </a>
          <a
            href="#como-funciona"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Como funciona
          </a>
          <a
            href="#perfis"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Perfis
          </a>
          <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
            FAQ
          </a>
        </nav>
        <Link href="/login">
          <Button
            size="sm"
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-700 hover:to-blue-700 hover:shadow-lg"
          >
            <LogIn className="mr-1.5 h-4 w-4" />
            Acessar
          </Button>
        </Link>
      </div>
    </header>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */
export default function GuiaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <GuideHeader />

      {/* ───── Hero ───── */}
      <Section className="!pt-20 md:!pt-28">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-xl shadow-indigo-500/25"
          >
            <BookOpen className="h-10 w-10 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
          >
            Bem-vindo ao{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
              Sigma
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            O Sistema Integrado de Manutenção da sua instituição. Solicite serviços de manutenção
            predial, ar-condicionado e elevadores com apenas alguns cliques e acompanhe tudo em
            tempo real.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <Link href="/login">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-8 font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-700 hover:to-blue-700 hover:shadow-xl"
              >
                Acessar o sistema
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#como-funciona">
              <Button variant="outline" size="lg" className="h-12 rounded-xl px-8">
                Ver como funciona
              </Button>
            </a>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground sm:gap-8"
          >
            {[
              { icon: Shield, text: 'Acesso seguro via rede institucional' },
              { icon: Zap, text: 'Notificações em tempo real' },
              { icon: Clock, text: 'Controle de SLA automático' },
            ].map(({ icon: BadgeIcon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <BadgeIcon className="h-4 w-4 text-indigo-500" />
                <span>{text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ───── Features ───── */}
      <Section id="recursos" className="bg-muted/30">
        <SectionTitle sub="Tudo o que você precisa para gerenciar chamados de manutenção de forma eficiente.">
          Recursos do Sigma
        </SectionTitle>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <FeatureCard
            index={0}
            icon={Ticket}
            title="Abertura de chamados"
            description="Crie chamados em poucos cliques, selecionando o tipo de serviço, local e descrição detalhada do problema."
            color="#6366f1"
          />
          <FeatureCard
            index={1}
            icon={Clock}
            title="SLA automático"
            description="Prazos de atendimento calculados automaticamente conforme a prioridade, respeitando horário de expediente e feriados."
            color="#f59e0b"
          />
          <FeatureCard
            index={2}
            icon={Bell}
            title="Notificações em tempo real"
            description="Receba alertas instantâneos quando seu chamado for classificado, atribuído a um técnico ou concluído."
            color="#10b981"
          />
          <FeatureCard
            index={3}
            icon={Wrench}
            title="Catálogo de serviços"
            description="Manutenção predial, ar-condicionado e elevadores organizados em um catálogo completo de serviços."
            color="#8b5cf6"
          />
          <FeatureCard
            index={4}
            icon={BarChart3}
            title="Painéis de Gestão e relatórios"
            description="Acompanhe métricas de desempenho, cumprimento de SLA e indicadores de qualidade (IMR) em painéis visuais."
            color="#ec4899"
          />
          <FeatureCard
            index={5}
            icon={Star}
            title="Avaliação de atendimento"
            description="Ao final de cada chamado, avalie a qualidade do serviço prestado com nota e comentário."
            color="#f97316"
          />
        </motion.div>
      </Section>

      {/* ───── How it works ───── */}
      <Section id="como-funciona">
        <SectionTitle sub="Do problema à solução em 5 passos simples.">Como funciona?</SectionTitle>

        <div className="mx-auto max-w-xl">
          <StepCard
            step={1}
            index={0}
            icon={LogIn}
            title="Faça login"
            description="Acesse o Sigma com sua matrícula e senha da rede. O sistema utiliza a mesma autenticação da instituição (Active Directory), então não é necessário criar uma nova conta."
          />
          <StepCard
            step={2}
            index={1}
            icon={Ticket}
            title="Abra um chamado"
            description='No menu "Meus Chamados", clique em "Novo Chamado". Selecione o tipo de serviço (manutenção predial, ar-condicionado ou elevador), o local, e descreva o problema com detalhes.'
          />
          <StepCard
            step={3}
            index={2}
            icon={ClipboardList}
            title="Classificação e atribuição"
            description="O preposto da sua unidade classifica a prioridade do chamado e o sistema atribui automaticamente o SLA. Um técnico qualificado é designado para o atendimento."
          />
          <StepCard
            step={4}
            index={3}
            icon={Headset}
            title="Acompanhe em tempo real"
            description='Receba notificações a cada mudança de status. Acompanhe o progresso pelo painel "Meus Chamados" — você verá quando o técnico iniciar e concluir o atendimento.'
          />
          <StepCard
            step={5}
            index={4}
            icon={Star}
            title="Avalie o serviço"
            description="Após a conclusão, avalie o atendimento com uma nota de 1 a 5 estrelas e deixe um comentário. Sua avaliação ajuda a melhorar continuamente a qualidade dos serviços."
          />
        </div>
      </Section>

      {/* ───── Roles ───── */}
      <Section id="perfis" className="bg-muted/30">
        <SectionTitle sub="Cada perfil possui funcionalidades específicas para o seu dia a dia.">
          Perfis de acesso
        </SectionTitle>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
          className="grid gap-5 sm:grid-cols-2"
        >
          <RoleCard
            index={0}
            icon={Users}
            title="Solicitante"
            color="#6366f1"
            description="Qualquer servidor da instituição que precise solicitar um serviço de manutenção."
            features={[
              'Abrir novos chamados de manutenção',
              'Acompanhar o status dos seus chamados',
              'Receber notificações de cada etapa',
              'Avaliar a qualidade do atendimento',
              'Visualizar dashboard com suas métricas',
            ]}
          />
          <RoleCard
            index={1}
            icon={Wrench}
            title="Técnico"
            color="#10b981"
            description="Profissional responsável por executar os serviços de manutenção solicitados."
            features={[
              'Visualizar chamados atribuídos a você',
              'Registrar execução e detalhes do atendimento',
              'Concluir chamados com relatório do serviço',
              'Acompanhar prazos de SLA em tempo real',
              'Dashboard personalizado com suas métricas',
            ]}
          />
          <RoleCard
            index={2}
            icon={ClipboardList}
            title="Preposto"
            color="#f59e0b"
            description="Gestor responsável por classificar chamados, definir prioridades e acompanhar a equipe."
            features={[
              'Classificar e priorizar chamados recebidos',
              'Atribuir técnicos aos chamados',
              'Painel de gestão com visão geral',
              'Acompanhar SLA e desempenho da equipe',
              'Receber alertas de chamados urgentes',
            ]}
          />
          <RoleCard
            index={3}
            icon={Settings}
            title="Administrador"
            color="#ec4899"
            description="Responsável pela configuração e gestão completa do sistema."
            features={[
              'Todas as funcionalidades dos demais perfis',
              'Gerenciar usuários, unidades e catálogo',
              'Configurar SLA, expediente e feriados',
              'Relatórios IMR (Índice de Medição de Resultados)',
              'Controle total do sistema',
            ]}
          />
        </motion.div>
      </Section>

      {/* ───── Ticket lifecycle ───── */}
      <Section id="ciclo">
        <SectionTitle sub="Entenda cada etapa do seu chamado, do início ao fim.">
          Ciclo de vida do chamado
        </SectionTitle>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={staggerContainer}
          className="mx-auto grid max-w-3xl gap-3"
        >
          {[
            {
              status: 'Aberto',
              desc: 'Chamado criado pelo solicitante. Aguardando classificação pelo preposto.',
              color: '#6366f1',
            },
            {
              status: 'Validado',
              desc: 'Preposto classificou a prioridade. SLA ativado automaticamente.',
              color: '#8b5cf6',
            },
            {
              status: 'Em atendimento',
              desc: 'Técnico designado iniciou o serviço. Você pode acompanhar o progresso.',
              color: '#f59e0b',
            },
            {
              status: 'Concluído',
              desc: 'Técnico finalizou o atendimento. Aguardando avaliação do solicitante.',
              color: '#10b981',
            },
            {
              status: 'Encerrado',
              desc: 'Chamado encerrado após avaliação. Histórico completo disponível para consulta.',
              color: '#64748b',
            },
          ].map((item, i) => (
            <motion.div
              key={item.status}
              variants={fadeUp}
              custom={i}
              className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 transition-all hover:shadow-md"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: item.color }}
              >
                {i + 1}
              </div>
              <div>
                <span className="font-semibold">{item.status}</span>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ───── FAQ ───── */}
      <Section id="faq" className="bg-muted/30">
        <SectionTitle sub="Respostas para as dúvidas mais comuns.">
          Perguntas frequentes
        </SectionTitle>

        <div className="mx-auto max-w-2xl space-y-3">
          <FaqItem
            index={0}
            q="Preciso criar uma conta para usar o Sigma?"
            a="Não. O Sigma utiliza a autenticação da rede institucional (Active Directory). Basta usar sua matrícula e a mesma senha que você usa para acessar os computadores da instituição."
          />
          <FaqItem
            index={1}
            q="Como sei qual tipo de serviço escolher?"
            a="Ao abrir um novo chamado, o sistema apresenta as categorias disponíveis: Manutenção Predial (elétrica, hidráulica, civil, etc.), Ar-Condicionado (instalação, manutenção) e Elevador. Dentro de cada categoria, há subtipos específicos para facilitar a escolha."
          />
          <FaqItem
            index={2}
            q="O que é SLA e como afeta meu chamado?"
            a="SLA (Acordo de Nível de Serviço) define o prazo máximo para resposta e resolução do seu chamado, baseado na prioridade definida pelo preposto. Os prazos são calculados automaticamente, considerando apenas dias úteis e horário de expediente."
          />
          <FaqItem
            index={3}
            q="Posso acompanhar meu chamado pelo celular?"
            a="Sim! O Sigma é totalmente responsivo e funciona em qualquer dispositivo com navegador. Você também receberá notificações em tempo real sobre o andamento do seu chamado."
          />
          <FaqItem
            index={4}
            q="Como faço se meu chamado for urgente?"
            a="Ao abrir o chamado, selecione a natureza 'Urgente'. O preposto avaliará e poderá atribuir prioridade EMERGENCIAL ou ALTA, que possuem prazos de SLA mais curtos para atendimento prioritário."
          />
          <FaqItem
            index={5}
            q="Posso cancelar um chamado depois de aberto?"
            a="Sim, enquanto o chamado estiver nos status iniciais (Aberto ou Validado), você pode solicitar o cancelamento. Após o técnico iniciar o atendimento, entre em contato com o preposto da sua unidade."
          />
          <FaqItem
            index={6}
            q="A quem devo recorrer se tiver problemas no sistema?"
            a="Entre em contato com a equipe de suporte de TI da instituição. O administrador do sistema poderá auxiliar com questões de acesso, configuração e dúvidas gerais."
          />
        </div>
      </Section>

      {/* ───── CTA ───── */}
      <Section>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={fadeUp}
          custom={0}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 p-8 text-center text-white sm:p-12"
        >
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/15 blur-[120px]" />

          <div className="relative z-10">
            <MessageSquare className="mx-auto mb-4 h-10 w-10 text-indigo-200" />
            <h2 className="text-2xl font-bold sm:text-3xl">Pronto para começar?</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-indigo-100/80 sm:text-base">
              Acesse o Sigma agora e abra seu primeiro chamado. É rápido, simples e você acompanha
              tudo em tempo real.
            </p>
            <Link href="/login" className="mt-8 inline-block">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-white px-8 font-medium text-indigo-700 shadow-lg transition-all hover:bg-indigo-50 hover:shadow-xl"
              >
                Acessar o Sigma
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </Section>

      {/* ───── Footer ───── */}
      <footer className="border-t border-border/40 py-8 text-center">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5">
          <div className="flex items-center gap-2">
            <SigmaLogo size={24} />
            <span className="text-sm font-semibold">Sigma</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sistema Integrado de Manutenção &mdash; {new Date().getFullYear()}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Acessar o sistema
            </Link>
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
