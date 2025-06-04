"use client";

import Link from "next/link";
import { Twitter, Linkedin, Github } from "lucide-react";
import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-secondary border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Product Column */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("footer.product")}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="#features"
                  className="text-muted-foreground hover:text-blue-600"
                >
                  {t("footer.features")}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-muted-foreground hover:text-blue-600"
                >
                  {t("nav.dashboard")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.habitTemplates")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.mobileApp")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("footer.company")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.about")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.blog")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.careers")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.press")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources Column */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("footer.resources")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.documentation")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.helpCenter")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.community")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.status")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">{t("footer.legal")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.terms")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.security")}
                </Link>
              </li>
              <li>
                <Link href="#" className="text-muted-foreground hover:text-blue-600">
                  {t("footer.cookies")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Social Links */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border">
          <div className="flex items-center space-x-4 mb-4 md:mb-0">
            <Link href="#" className="text-muted-foreground hover:text-blue-600">
              <Twitter className="w-5 h-5" />
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-blue-600">
              <Linkedin className="w-5 h-5" />
            </Link>
            <Link href="#" className="text-muted-foreground hover:text-blue-600">
              <Github className="w-5 h-5" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {currentYear} BetterR.me. {t("footer.allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
} 