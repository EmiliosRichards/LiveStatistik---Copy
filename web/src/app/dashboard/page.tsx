'use client'

export default function DashboardPage() {
  const expressUrl = process.env.NEXT_PUBLIC_EXPRESS_URL || 'http://localhost:5000'
  
  return (
    <div className="h-screen w-full">
      <iframe
        src={`${expressUrl}/?embed=1`}
        className="w-full h-full border-0"
        title="Statistics Dashboard"
      />
    </div>
  )
}
