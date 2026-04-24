import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignInForm } from "#/components/auth/sign-in-form";

export const Route = createFileRoute("/_unauth/sign-in")({
  component: () => (
    <AuthLayout title="Sign in" subtitle="Welcome back.">
      <SignInForm />
      <p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
        Don't have an account?{" "}
        <Link to="/sign-up" className="text-[var(--lagoon-deep)] underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  ),
});
