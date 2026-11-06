import test from 'node:test';
import { VIEWPORTS, verifySkeletonRoutes } from './helpers/skeletonRouteGeometry.mjs';

test('mobile routes group 1: skeletons match the loaded layout without shifting', t => verifySkeletonRoutes(t, [VIEWPORTS[0]], [0, 3]));
