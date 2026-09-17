import { redirect } from 'next/navigation'

export default function CartPage() {
  // The storefront intentionally uses one combined cart + checkout screen.
  // Keep the conventional /cart URL functional for users and quality crawlers
  // instead of returning a dead 404.
  redirect('/checkout')
}
