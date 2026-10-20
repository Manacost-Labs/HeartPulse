// The connect page's account route with the sign-in skeleton's geometry: the
// stylesheet loads with this lazy chunk, not with the route's first paint.
import '@/src/modules/identity/ui/LoginCardSkeleton.css';

export { default } from '@/src/modules/accountRoute/public';
