import { AuthBranding } from "@/components/auth-branding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AuthBranding />
        <div className="flex flex-col gap-section-gap">
          <Card>
            <CardHeader>
              <CardTitle className="text-page-title font-semibold">
                Sorry, something went wrong.
              </CardTitle>
            </CardHeader>
            <CardContent>
              {params?.error ? (
                <p className="text-body text-muted-foreground">
                  Code error: {params.error}
                </p>
              ) : (
                <p className="text-body text-muted-foreground">
                  An unspecified error occurred.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
