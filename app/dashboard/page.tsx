"use client";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Target, 
  TrendingUp, 
  Calendar, 
  Plus,
  CheckCircle2,
  Clock,
  Trophy
} from "lucide-react";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      
      if (error || !data?.user) {
        redirect("/auth/login");
      } else {
        setUser(data.user);
        setLoading(false);
      }
    }
    
    checkUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getUserName = () => {
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || "there";
  };

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {getGreeting()}, {getUserName()}! 👋
        </h1>
        <p className="text-muted-foreground">
          Ready to be a little better today? Let&apos;s check your progress.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Habits
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              +1 from last week
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Today&apos;s Progress
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2/3</div>
            <p className="text-xs text-muted-foreground">
              67% completion rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Current Streak
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground">
              days in a row
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Level
            </CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">
              Self-Improver
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Habits */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Today&apos;s Habits</CardTitle>
              <CardDescription>
                Complete your daily habits to build better routines
              </CardDescription>
            </div>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Habit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sample habits - you'll replace this with real data later */}
          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div className="flex-1">
              <h4 className="font-medium">Morning Meditation</h4>
              <p className="text-sm text-muted-foreground">10 minutes of mindfulness</p>
            </div>
            <Badge variant="secondary">Completed</Badge>
          </div>
          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <Clock className="h-5 w-5 text-orange-500" />
            <div className="flex-1">
              <h4 className="font-medium">Daily Exercise</h4>
              <p className="text-sm text-muted-foreground">30 minutes of physical activity</p>
            </div>
            <Badge variant="outline">Pending</Badge>
          </div>
          <div className="flex items-center space-x-4 p-4 border rounded-lg">
            <Clock className="h-5 w-5 text-orange-500" />
            <div className="flex-1">
              <h4 className="font-medium">Read for 20 minutes</h4>
              <p className="text-sm text-muted-foreground">Personal development or fiction</p>
            </div>
            <Badge variant="outline">Pending</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Weekly Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              See your progress across the week and identify patterns.
            </p>
            <Button variant="outline" className="w-full">
              View Calendar
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Progress Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Dive deep into your habit statistics and trends.
            </p>
            <Button variant="outline" className="w-full">
              View Analytics
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
