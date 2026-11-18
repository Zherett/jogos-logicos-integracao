import { Shield, FileText, HardDrive, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type LegalTab = "privacidade" | "termos" | "armazenamento";

interface LegalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: LegalTab;
}

export const DPO_CONTACT_EMAIL = "integracaosemed@gmail.com";

export function LegalModal({
  open,
  onOpenChange,
  defaultTab = "privacidade",
}: LegalModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Privacidade, Termos de Uso e LGPD
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} key={defaultTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-xl">
            <TabsTrigger value="privacidade" className="text-xs sm:text-sm font-bold">
              Privacidade (LGPD)
            </TabsTrigger>
            <TabsTrigger value="termos" className="text-xs sm:text-sm font-bold">
              Termos de Uso
            </TabsTrigger>
            <TabsTrigger value="armazenamento" className="text-xs sm:text-sm font-bold">
              Dados Locais
            </TabsTrigger>
          </TabsList>

          <TabsContent value="privacidade" className="mt-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <div className="rounded-2xl border bg-muted/30 p-3.5 text-foreground">
              <p className="font-bold">
                Controlador: Secretaria Municipal de Educação de Coari (SEMED Coari/AM) — Projeto INTEGRAÇÃO
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  Encarregado pelo Tratamento de Dados (DPO):{" "}
                  <a
                    href={`mailto:${DPO_CONTACT_EMAIL}`}
                    className="font-bold text-primary underline"
                  >
                    {DPO_CONTACT_EMAIL}
                  </a>
                </span>
              </p>
            </div>

            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">1. Dados Coletados e Minimização</h4>
              <p>
                Seguindo o princípio da minimização de dados (Art. 6º, III e Art. 14 da LGPD — Lei nº 13.709/2018),
                coletamos apenas o estritamente necessário para a atividade pedagógica gamificada:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Identificação abreviada:</strong> primeiro nome e inicial do segundo nome (ex.: <em>MARIA S.</em>) e apelido (<em>nick</em>);</li>
                <li><strong>Vínculo escolar:</strong> instituição de ensino, série/ano, turma e etapa educacional (1ª, 2ª ou 3ª Etapa);</li>
                <li><strong>Desempenho nos jogos:</strong> pontuações, XP, medalhas, nível e participação em torneios/desafios X1.</li>
              </ul>
              <p className="font-semibold text-foreground">
                Não coletamos data de nascimento, CPF, RG, telefone, endereço residencial ou e-mail dos estudantes.
              </p>
            </section>

            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">2. Finalidade, Base Legal e Menores de Idade</h4>
              <p>
                Os dados são utilizados exclusivamente para fins educacionais, acompanhamento pedagógico e ranqueamento
                escolar, com base na execução de políticas públicas educacionais (Art. 7º, III e Art. 23 da LGPD) e no
                melhor interesse de crianças e adolescentes (Art. 14 da LGPD), mediante ciência e autorização dos pais
                ou responsáveis legais.
              </p>
            </section>

            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">3. Compartilhamento e Transferência Internacional</h4>
              <p>
                Não vendemos nem compartilhamos dados com anunciantes. Para autenticação, salvamento de progresso e
                funcionamento do site, os dados trafegam e são armazenados na infraestrutura em nuvem da{" "}
                <strong>Microsoft Azure PlayFab</strong> e o aplicativo é entregue via <strong>GitHub Pages</strong>{" "}
                (Art. 33 da LGPD).
              </p>
            </section>

            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">4. Retenção, Direitos do Titular e Exclusão</h4>
              <p>
                Contas enviadas à lixeira pelo administrador são removidas após 7 dias. Pais, responsáveis ou alunos
                podem exercer os direitos previstos no Art. 18 da LGPD (acesso, correção, anonimização ou exclusão
                definitiva) enviando solicitação para{" "}
                <a href={`mailto:${DPO_CONTACT_EMAIL}`} className="font-bold text-primary underline">
                  {DPO_CONTACT_EMAIL}
                </a>{" "}
                ou procurando a coordenação da escola.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="termos" className="mt-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-2 font-display font-bold text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              Regras de Uso da Plataforma
            </div>
            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">1. Objeto</h4>
              <p>
                A plataforma <strong>Desafios de Lógica — Projeto INTEGRAÇÃO (SEMED Coari)</strong> oferece jogos
                educativos gratuitos para apoio ao raciocínio lógico e matemático de estudantes do Ensino Fundamental
                e comunidade.
              </p>
            </section>
            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">2. Conduta do Usuário</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>É proibido escolher apelidos (<em>nicks</em>) ofensivos, discriminatórios ou impróprios ao ambiente escolar;</li>
                <li>Cada estudante deve utilizar apenas a própria conta, sem compartilhar senha com terceiros;</li>
                <li>É proibida qualquer tentativa de fraude, automação ou adulteração de pontuações, torneios ou partidas X1;</li>
                <li>A coordenação/administração pode suspender ou remover contas que descumprirem estas regras.</li>
              </ul>
            </section>
            <section className="space-y-1">
              <h4 className="font-display font-bold text-foreground">3. Disponibilidade e Propriedade</h4>
              <p>
                O conteúdo pedagógico e a interface da plataforma destinam-se ao uso educacional sem fins lucrativos.
                Eventuais manutenções ou atualizações de temporada podem ocorrer sem aviso prévio.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="armazenamento" className="mt-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <div className="flex items-center gap-2 font-display font-bold text-foreground">
              <HardDrive className="h-4 w-4 text-primary" />
              Aviso sobre Armazenamento Local (Sem Cookies de Rastreamento)
            </div>
            <p>
              Esta plataforma <strong>não utiliza cookies de publicidade, marketing ou rastreamento comportamental</strong>.
            </p>
            <p>
              Para que os jogos funcionem mesmo com internet instável nas escolas, utilizamos o armazenamento local do
              navegador (<code>localStorage</code> e <code>sessionStorage</code>) exclusivamente para:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Manter sua sessão conectada enquanto joga;</li>
              <li>Salvar preferências de tema (claro/escuro) e efeitos sonoros;</li>
              <li>Guardar temporariamente seu progresso até a sincronização com o servidor.</li>
            </ul>
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-foreground">
              ⚠️ <strong>Dica para laboratórios de informática:</strong> ao usar um computador compartilhado na escola,
              lembre-se sempre de clicar em <strong>Sair</strong> no menu do jogador ao terminar sua aula.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
