// Box and item pages take their id as a query param (not a path segment) so
// each screen is a single static page the service worker can precache. That
// keeps boxes created offline openable with no connection.

export const boxHref = (id: string) => `/box?id=${encodeURIComponent(id)}`;
export const addItemHref = (boxId: string) => `/box/add-item?id=${encodeURIComponent(boxId)}`;
export const itemHref = (id: string) => `/item?id=${encodeURIComponent(id)}`;
