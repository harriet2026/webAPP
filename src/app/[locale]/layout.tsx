import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeColorProvider } from "@/contexts/theme-color-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isDemoAuthBypassEnabled } from "@/lib/demo-auth-bypass";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "zh" | "en" | "th" | "ru")) {
    notFound();
  }

  const messages = await getMessages();
  const demoAuthBypassEnabled = isDemoAuthBypassEnabled(
    process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER,
  );

  return (
    <NextIntlClientProvider messages={messages}>
      <QueryProvider>
        <AuthProvider demoAuthBypassEnabled={demoAuthBypassEnabled}>
          <ThemeColorProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster />
          </ThemeColorProvider>
        </AuthProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
