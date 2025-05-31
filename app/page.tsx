import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { ArrowRight, CheckCircle, Calendar, BarChart, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Betterr.me</Link>
            </div>
            <div className="flex items-center gap-4">
              <AuthButton />
              <ThemeSwitcher />
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <div className="flex flex-col items-center text-center gap-8">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Track Your Habits,{" "}
              <span className="text-primary">Transform Your Life</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Join betterr.me to build better habits, track your progress, and achieve your goals. Start your journey to self-improvement today.
            </p>
            <div className="flex gap-4">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Features Section */}
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <Calendar className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">Daily Tracking</h3>
              <p className="text-muted-foreground">
                Easily track your habits daily with a simple, intuitive interface.
              </p>
            </div>
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <BarChart className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">Progress Insights</h3>
              <p className="text-muted-foreground">
                Visualize your progress with detailed statistics and insights.
              </p>
            </div>
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <Sparkles className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">Stay Motivated</h3>
              <p className="text-muted-foreground">
                Build streaks, earn achievements, and stay motivated on your journey.
              </p>
            </div>
          </div>

          {/* CTA Section */}
          <div className="flex flex-col items-center text-center gap-4 p-8 rounded-lg border bg-card">
            <h2 className="text-2xl font-semibold">Ready to Start Your Journey?</h2>
            <p className="text-muted-foreground max-w-2xl">
              Join thousands of users who are already building better habits and transforming their lives.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 mt-4"
            >
              Get Started for Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
