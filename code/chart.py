"""规则排盘：唯一真源，纯计算无LLM。lunar-python实测通过。"""

from datetime import datetime, timedelta

from lunar_python import Solar

GAN_WUXING = dict(
    zip(
        "甲乙丙丁戊己庚辛壬癸",
        ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"],
        strict=True,
    )
)
ZHI_WUXING = dict(
    zip(
        "子丑寅卯辰巳午未申酉戌亥",
        ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"],
        strict=True,
    )
)


def solar_correction(dt: datetime, lon: float | None, use_corr: bool):
    if not use_corr or lon is None:
        return dt, 0
    delta_min = (lon - 120.0) * 4.0
    return dt + timedelta(minutes=delta_min), round(delta_min, 1)


def paipan(y, m, d, H, Mi, lon=None, use_corr=True, unknown_hour=False, gender="男"):
    dt = datetime(y, m, d, H, Mi, 0)
    dt_corr, corr_min = solar_correction(dt, lon, use_corr)
    s = Solar.fromYmdHms(
        dt_corr.year, dt_corr.month, dt_corr.day, dt_corr.hour, dt_corr.minute, 0
    )
    lunar = s.getLunar()
    b = lunar.getEightChar()
    pillars = {
        "year": b.getYear(),
        "month": b.getMonth(),
        "day": b.getDay(),
        "time": b.getTime() if not unknown_hour else "未知",
    }
    wuxing = {}
    for gz in pillars.values():
        if gz == "未知":
            continue
        for ch in gz:
            if ch in GAN_WUXING:
                w = GAN_WUXING[ch]
                wuxing[w] = wuxing.get(w, 0) + 1
            elif ch in ZHI_WUXING:
                w = ZHI_WUXING[ch]
                wuxing[w] = wuxing.get(w, 0) + 1
    dayun = []
    try:
        yun = b.getYun(1 if gender == "男" else 0, 0)
        for dy in (yun.getDaYun() or [])[:8]:
            dayun.append(
                {
                    "startAge": dy.getStartAge(),
                    "endAge": dy.getEndAge(),
                    "ganzhi": dy.getGanZhi(),
                }
            )
    except (AttributeError, TypeError, ValueError):
        dayun = []
    return {
        "pillars": pillars,
        "wuxing_count": wuxing,
        "shishen": {
            "year": [b.getYearShiShenGan(), b.getYearShiShenZhi()],
            "month": [b.getMonthShiShenGan(), b.getMonthShiShenZhi()],
            "day": [b.getDayShiShenGan(), b.getDayShiShenZhi()],
            "time": [b.getTimeShiShenGan(), b.getTimeShiShenZhi()]
            if not unknown_hour
            else "未知",
        },
        "canggan": {
            "year": b.getYearHideGan(),
            "month": b.getMonthHideGan(),
            "day": b.getDayHideGan(),
            "time": b.getTimeHideGan() if not unknown_hour else [],
        },
        "dayun": dayun,
        "shengxiao": lunar.getYearShengXiao(),
        "solar_corr_min": corr_min,
        "corrected_time": dt_corr.strftime("%Y-%m-%d %H:%M"),
        "note": "排盘为规则计算；时辰未知仅供参考"
        if unknown_hour
        else "娱乐参考，真太阳时已校正"
        if corr_min
        else "娱乐参考",
    }
