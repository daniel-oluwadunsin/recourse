import { AuthGate } from '@/components/auth-gate';
import { SiteHeader } from '@/components/site-header';

export default function CasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <SiteHeader compact />
      {children}
    </AuthGate>
  );
}
