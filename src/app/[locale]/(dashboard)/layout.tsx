import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppShell } from '@/components/layout/app-shell';
import { ProductFormProvider } from '@/contexts/product-form-context';

// 在服务端读取 OSGATEWAY_PRODUCT_FORM_SWITCHER（本 layout 是 Server Component），
// 因此该环境变量不需要 NEXT_PUBLIC_ 前缀 —— 值通过 props 传给客户端 provider，
// Next.js 不会把它内联进客户端 bundle。真值（"1"/"true" 等）启用切换器。
const SWITCHER_TRUTHY = new Set(['1', 'true', 'TRUE', 'yes']);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const switcherEnabled = SWITCHER_TRUTHY.has(process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER ?? '');

  return (
    <ProtectedRoute>
      <ProductFormProvider switcherEnabled={switcherEnabled}>
        <AppShell>{children}</AppShell>
      </ProductFormProvider>
    </ProtectedRoute>
  );
}
