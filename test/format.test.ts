import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent, formatAccelerator } from '../src/shared/accelerator'
import { applyDictionary, basicFormat, checkDivergence, hasSelfCorrection, removeFillers, unspokenNumbers, usableEnglish } from '../src/main/format'

const dict = [{ id: '1', word: 'Lawgical', heardAs: ['lô gi cồ', 'logical'] }]

describe('removeFillers', () => {
  it('drops hesitation sounds', () => {
    expect(removeFillers('ờ mai mình ừm đi họp')).toBe('mai mình đi họp')
    expect(removeFillers('ờờ ừmm hmm được')).toBe('được')
  })
  it('keeps words that carry meaning', () => {
    expect(removeFillers('ừ anh đi à')).toBe('ừ anh đi à')
    expect(removeFillers('gửi giúp em nhé ạ')).toBe('gửi giúp em nhé ạ')
  })
})

describe('applyDictionary', () => {
  it('replaces heard-as variants and fixes casing, whole words only', () => {
    const r = applyDictionary('mở lô gi cồ rồi xem logical và lawgical', dict)
    expect(r.text).toBe('mở Lawgical rồi xem Lawgical và Lawgical')
    expect(r.replacements).toBe(3)
    expect(applyDictionary('illogical', dict).text).toBe('illogical')
  })
})

describe('basicFormat', () => {
  it('turns raw ALL-CAPS ASR output into a sentence', () => {
    expect(basicFormat('ỜỜ MAI MÌNH ĐI HỌP LÚC BA GIỜ')).toBe('Mai mình đi họp lúc ba giờ.')
  })
  it('detects common Vietnamese questions', () => {
    expect(basicFormat('anh có đi họp không')).toBe('Anh có đi họp không?')
    expect(basicFormat('tại sao nó lỗi')).toBe('Tại sao nó lỗi?')
  })
  it('applies the dictionary', () => {
    expect(basicFormat('mở lô gi cồ lên', dict)).toBe('Mở Lawgical lên.')
  })
  it('returns empty for pure filler', () => {
    expect(basicFormat('ờ ừm')).toBe('')
  })
})

describe('checkDivergence', () => {
  const raw = 'ờ gửi email cho anh nam nói là mai họp lúc ba giờ chiều nhé'
  it('accepts a faithful cleanup, including numbers turned to digits', () => {
    expect(checkDivergence(raw, 'Gửi email cho anh Nam nói là mai họp lúc 3 giờ chiều nhé.').ok).toBe(true)
  })
  it('rejects the model writing the email instead of transcribing', () => {
    const answer =
      'Kính gửi anh Nam, em xin thông báo cuộc họp ngày mai sẽ diễn ra vào lúc 15 giờ chiều tại phòng họp lớn. Rất mong anh sắp xếp thời gian tham dự. Trân trọng.'
    expect(checkDivergence(raw, answer).ok).toBe(false)
  })
  it('accepts a dictated enumeration reshaped into a list, with "list" misheard as "như"', () => {
    const raw = 'như đồ ăn đi siêu thị gồm có gạo mì bún phở trứng thịt heo bò gà cá tôm rau xanh hành tỏi gừng'
    const list = ['Đồ ăn đi siêu thị:', ...['Gạo', 'Mì', 'Bún', 'Phở', 'Trứng', 'Thịt heo', 'Thịt bò', 'Thịt gà', 'Cá', 'Tôm', 'Rau xanh', 'Hành', 'Tỏi', 'Gừng'].map((i) => `- ${i}`)].join('\n')
    expect(checkDivergence(raw, list).ok).toBe(true)
  })
  it('allows dictionary words the raw text never contained', () => {
    expect(checkDivergence('mở lô gi cồ lên', 'Mở Lawgical lên.', dict).ok).toBe(true)
  })
  it('accepts English words restored from their Vietnamese spelling', () => {
    expect(checkDivergence('chéc lại cái đét lai của pờ rô dếch này rồi gửi ri pót cho tim nhé', 'Check lại cái deadline của project này rồi gửi report cho team nhé.').ok).toBe(true)
    expect(checkDivergence('cả ngày hôm qua có bao nhiêu người raticer mới', 'Cả ngày hôm qua có bao nhiêu người register mới?').ok).toBe(true)
    expect(checkDivergence('chiều nay có my tìm với tim ma kết tinh lúc ba giờ', 'Chiều nay có meeting với team marketing lúc 3 giờ.').ok).toBe(true)
    expect(checkDivergence('pút cốt lên thua rồi tảo turi quét cho anh review', 'Push code lên GitHub rồi tạo pull request cho anh review.').ok).toBe(true)
  })
  it('accepts English words that only the English model heard', () => {
    expect(checkDivergence('lừa đảo toàn bộ bằng tiếng việt', 'Report toàn bộ bằng tiếng Việt.', [], ['Report.']).ok).toBe(true)
    expect(checkDivergence('anh check lại cái của này nhé', 'Anh check lại cái deadline của project này nhé.', [], ["I'm Ted Lite Guy, deadline. Or project. Nine, eh?"]).ok).toBe(true)
  })
  it('rejects a translation into English', () => {
    expect(checkDivergence('chéc lại cái đét lai của pờ rô dếch này nhé', 'Check the deadline of this project.').ok).toBe(false)
    expect(checkDivergence('ri pót toàn bộ bằng tiếng việt', 'Report everything in Vietnamese.').ok).toBe(false)
  })
})

describe('unspokenNumbers', () => {
  it('accepts numbers written as digits the way people type them', () => {
    expect(unspokenNumbers('em cần đi ploi trước năm giờ', 'Em cần deploy trước 5 giờ.')).toEqual([])
    expect(unspokenNumbers('mai họp lúc ba giờ chiều', 'Mai họp lúc 15 giờ.')).toEqual([])
    expect(unspokenNumbers('mười ba nghìn dòng', '13.000 dòng')).toEqual([])
    expect(unspokenNumbers('giảm hai mươi phần trăm', 'Giảm 20%.')).toEqual([])
    expect(unspokenNumbers('một trăm hai mươi lăm nghìn đồng', '125.000 đồng')).toEqual([])
    expect(unspokenNumbers('năm hai nghìn không trăm hai mươi lăm', 'Năm 2025')).toEqual([])
    expect(unspokenNumbers('gửi báo cáo tháng mười hai', 'Gửi báo cáo tháng 12.')).toEqual([])
    expect(unspokenNumbers('hai triệu rưỡi', '2,5 triệu')).toEqual([])
    expect(unspokenNumbers('họp lúc hai giờ rưỡi', 'Họp lúc 2:30.')).toEqual([])
  })
  it('ignores list numbering', () => {
    expect(unspokenNumbers('đầu tiên vo gạo sau đó nấu', '1. Vo gạo.\n2. Nấu.')).toEqual([])
  })
  it('flags a number that was never said', () => {
    expect(unspokenNumbers('em cần đi ploi trước năm giờ', 'Em cần deploy trước 9 giờ.')).toEqual([9])
    expect(unspokenNumbers('chuyển cho anh ba triệu', 'Chuyển cho anh 30.000.000.')).toEqual([30000000])
  })
})

describe('hasSelfCorrection', () => {
  it('spots a speaker correcting themself', () => {
    expect(hasSelfCorrection('mai em đi làm lúc bảy giờ à không tám giờ')).toBe(true)
    expect(hasSelfCorrection('chuyển cho anh hai triệu à nhầm ba triệu nhé')).toBe(true)
    expect(hasSelfCorrection('gửi cho chị Lan ý là chị Hoa')).toBe(true)
  })
  it('leaves ordinary sentences alone', () => {
    expect(hasSelfCorrection('anh có đi không')).toBe(false)
    expect(hasSelfCorrection('không sao đâu em')).toBe(false)
    expect(hasSelfCorrection('chiều nay có meeting với team marketing lúc ba giờ')).toBe(false)
  })
})

describe('usableEnglish', () => {
  it('drops looping or runaway English output', () => {
    expect(usableEnglish('The couple is also a little bit of a little bit of a little bit of a little bit of a little bit of', 'lên thua rồi tảo turi quét cho anh review')).toBeUndefined()
    expect(usableEnglish('', 'xin chào')).toBeUndefined()
  })
  it('keeps a plausible hint', () => {
    expect(usableEnglish(' Report. ', 'lừa đảo toàn bộ bằng tiếng việt')).toBe('Report.')
  })
})

describe('formatAccelerator', () => {
  it('formats per platform', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘⇧Space')
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'win32')).toBe('Ctrl+Shift+Space')
  })
})

describe('acceleratorFromEvent', () => {
  const ev = (code: string, m: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...m })
  it('builds accelerators and ignores bare keys or modifier-only presses', () => {
    expect(acceleratorFromEvent(ev('Space', { metaKey: true, shiftKey: true }), 'darwin')).toBe('Command+Shift+Space')
    expect(acceleratorFromEvent(ev('KeyD', { ctrlKey: true, altKey: true }), 'win32')).toBe('Control+Alt+D')
    expect(acceleratorFromEvent(ev('KeyD'), 'darwin')).toBeNull()
    expect(acceleratorFromEvent(ev('ShiftLeft', { shiftKey: true }), 'darwin')).toBeNull()
    expect(acceleratorFromEvent(ev('F5'), 'darwin')).toBe('F5')
  })
})
