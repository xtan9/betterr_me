"use client";

import Link from "next/link";
import { Twitter, Linkedin, Github } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";

export default function Footer() {
  const { t } = useLanguage();
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

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border">
          <div className="text-muted-foreground mb-4 md:mb-0">
            © {currentYear} BetterR.me. {t("footer.allRightsReserved")}
          </div>

          <div className="flex space-x-6">
            <a href="#" className="text-muted-foreground hover:text-foreground">
              <span className="sr-only">Twitter</span>
              <Twitter className="h-6 w-6" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground">
              <span className="sr-only">LinkedIn</span>
              <Linkedin className="h-6 w-6" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground">
              <span className="sr-only">GitHub</span>
              <Github className="h-6 w-6" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
} 