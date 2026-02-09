import Link from "next/link";
import { Twitter, Linkedin, Github } from "lucide-react";
import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('common.footer');
  const navT = await getTranslations('common.nav');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-secondary border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("product")}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#features"
                  className="text-muted-foreground hover:text-emerald-600"
                >
                  {t("features")}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-muted-foreground hover:text-emerald-600"
                >
                  {navT("dashboard")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("habitTemplates")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("mobileApp")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("company")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("about")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("blog")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("careers")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("press")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("resources")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("documentation")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("helpCenter")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("community")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("status")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("legal")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("security")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-emerald-600">
                  {t("cookies")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border">
          <div className="flex items-center space-x-4 mb-4 md:mb-0">
            <Link href="#" className="text-muted-foreground hover:text-emerald-600">
              <Twitter className="w-5 h-5" />
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-emerald-600">
              <Linkedin className="w-5 h-5" />
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-emerald-600">
              <Github className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {currentYear} BetterR.me. {t("allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
} 