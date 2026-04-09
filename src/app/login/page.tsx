"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, isFirebaseAuthConfigured } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isFirebaseAuthConfigured || !auth) {
      setError("Firebase nao configurado. Defina as variaveis NEXT_PUBLIC_FIREBASE_* na Vercel.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "auth/invalid-api-key"
          ? "Chave da API Firebase invalida. Revise NEXT_PUBLIC_FIREBASE_API_KEY na Vercel."
          : "Falha no login. Verifique suas credenciais.";
      setError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.22),transparent)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="relative z-10 mx-auto flex w-full max-w-[1500px] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-border bg-card/85 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold tracking-tight text-card-foreground">Rota Digital</CardTitle>
            <CardDescription>
              Acesse a plataforma para visualizar os leads e as rotas
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com"
                  required
                  className="bg-muted/50 border-input placeholder:text-muted-foreground focus-visible:ring-sidebar-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-muted/50 border-input focus-visible:ring-sidebar-primary"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                Entrar
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
