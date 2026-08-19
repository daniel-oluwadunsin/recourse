import { CaseShell } from "../../../../components/case-shell";

export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <CaseShell caseId={caseId}>{children}</CaseShell>;
}
