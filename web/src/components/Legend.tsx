/** Plain-language delay legend, bottom-left over the map. See CLAUDE.md "Map style". */
export default function Legend() {
  return (
    <div className="absolute bottom-6 left-5 w-[230px] rounded-[10px] border border-(--line) bg-(--surface) px-[18px] py-4 backdrop-blur-[8px]">
      <div className="text-xs text-(--muted)">Average delay at this station</div>
      <div
        className="my-2 h-1.5 rounded-full"
        style={{ background: 'linear-gradient(90deg, #5eead4, #fbbf24, #f43f5e)' }}
      />
      <div className="flex justify-between text-xs text-(--muted)">
        <span>on time</span>
        <span>8+ min late</span>
      </div>
    </div>
  )
}
