import { notFound } from 'next/navigation'

// /products/new doesn't have a meaningful form — NEXUS generates products
// via the autopilot pipeline (Jobs → workflow runs → /review), not via a
// manual "create product" wizard. Silently redirecting here to /jobs/new
// (a differently-named Freelance Job form) confused testers (BUG-209), so
// we 404 instead. If you want a manual create flow, build it here and
// remove this stub.
export default function NewProductPage(): never {
  notFound()
}
