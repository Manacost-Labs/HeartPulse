import test from 'node:test';
import { VIEWPORTS, verifySkeletonRoutes } from './helpers/skeletonRouteGeometry.mjs';

test('desktop routes: skeletons match the loaded layout without shifting', t => verifySkeletonRoutes(t, [VIEWPORTS[1]]));
