import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "#/components/auth/auth-layout";
import { SignUpForm } from "#/components/auth/sign-up-form";

export const Route = createFileRoute("/_unauth/sign-up")({
  component: () => (
    <AuthLayout title="Create your account" subtitle="One workspace, just for you.">
      <SignUpForm />
      <p className="mt-4 text-xs text-[var(--sea-ink-soft)]">
        Already have an account?{" "}
        <Link to="/sign-in" className="text-[var(--lagoon-deep)] underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  ),
});
