// Thin page wrapper — Next.js 15 requires page components to accept only
// PageProps (params/searchParams). The testable logic lives in verify-form.tsx.
import { VerifyForm } from "./verify-form";

export default function VerifyPage() {
  return <VerifyForm />;
}
