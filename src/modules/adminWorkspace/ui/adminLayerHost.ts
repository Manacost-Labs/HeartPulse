/** Attribute of the element the admin console renders for portalled layers (side sheets, cards). */
export const ADMIN_LAYER_HOST_ATTRIBUTE = 'data-admin-layer-host';

/**
 * Where admin side sheets portal to: the console's layer host, inside its theme scope, so they get
 * the console's tokens and the shared content styles; outside the console (stories) `<body>`.
 * Both are free of transformed ancestors, so a fixed sheet stays anchored to the viewport.
 */
export function adminLayerHost(): Element {
  return document.querySelector(`[${ADMIN_LAYER_HOST_ATTRIBUTE}]`) ?? document.body;
}
