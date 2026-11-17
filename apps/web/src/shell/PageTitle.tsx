// Every page's title: the document title and the h1. The h1 can take focus, so the shell moves
// focus to it after a navigation (screen readers then read the new page; WCAG 2.4.3).
export function PageTitle({ children }: { children: string }) {
  return (
    <>
      <title>{`${children} · Chắt Chiu`}</title>
      <h1
        tabIndex={-1}
        className="text-xl font-extrabold tracking-[-0.01em] outline-none md:text-2xl"
      >
        {children}
      </h1>
    </>
  )
}
