export default function Loading(){
  return (
    <div className='min-h-screen flex items-center justify-center bg-neutral-900 text-white'>
      <div className='flex items-center gap-3'>
        <span className='inline-block h-3 w-3 rounded-full bg-white animate-pulse'></span>
        <span className='inline-block h-3 w-3 rounded-full bg-white/80 animate-pulse [animation-delay:150ms]'></span>
        <span className='inline-block h-3 w-3 rounded-full bg-white/60 animate-pulse [animation-delay:300ms]'></span>
      </div>
    </div>
  )
}
