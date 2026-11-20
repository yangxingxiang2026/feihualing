'use strict';
/**
 * 候选生成（v1.4 §2.3 四类干扰口径 + 名家经典偏好，2026-11-18 二次修订）
 * 铁律：候选只负责降门槛，玩家点选/拼句结果必须完整跑 judge()，不得"点选即合法"。
 *
 * ★ 经典偏好：正确句/AI 手牌优先抽「名家/名篇」白名单（教材级常见诗词），
 *   白名单内不足 6 句才放宽到全库——回应"诗词库优先经典"的产品要求。
 *
 * 点选接句：4 卡 = 1 正确 + 3 干扰，干扰项必须 judge 判不通过（挑战性保证）：
 *   - noKw：库内真实名句但【不含关键字】→ judge NO_KEYWORD（迷惑性最高）
 *   - fake：库外拼合句（含关键字，生成期校验 norm_index 不命中）→ NOT_IN_CORPUS
 *   - dup 已废弃（2026-11-18 用户反馈「还是有重复」）：已用句一律不进选项
 *   生成期逐条用 judge 复核干扰项必须 fail，任何意外放行的干扰直接弃用。
 *
 * 字块拼句：5 言 → 5 正 + 3 干扰；7 言 → 7 正 + 1 干扰（均为 8 块 4×2）。
 *   干扰字优先取自常用字表（拒绝生僻字），且满足不变量：
 *   ★ 任何含干扰块的 5/7 字排列，norm_key 都不得命中句库（拼错必判 NOT_IN_CORPUS）。
 *
 * rng 可注入（mulberry32 种子）保证测试确定性；线上传 Math.random。
 */
const { judge, corpus, normKey, POOL } = require('../../src/judge');

/** mulberry32：可复现伪随机 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const lineText = i => corpus.lines[i].split('|')[0];

// ---------------- 名家经典白名单 ----------------
// 教材级常见诗词作者（覆盖小学到高中必背 + 飞花令节目高频作者）
const FAMOUS_AUTHORS = new Set([
  '李白', '杜甫', '白居易', '王维', '孟浩然', '王昌龄', '王之涣', '杜牧', '李商隐',
  '岑参', '高适', '刘禹锡', '柳宗元', '韩愈', '孟郊', '贾岛', '贺知章', '张继',
  '李绅', '骆宾王', '张九龄', '崔颢', '韦应物', '刘长卿', '卢纶', '李益', '金昌绪',
  '王翰', '王建', '张籍', '元稹', '李贺', '杜秋娘', '陈子昂', '李峤',
  '苏轼', '辛弃疾', '李清照', '陆游', '王安石', '欧阳修', '范仲淹', '晏殊', '晏几道',
  '柳永', '秦观', '杨万里', '范成大', '朱熹', '叶绍翁', '林升', '翁卷', '雷震',
  '文天祥', '于谦', '郑燮', '纳兰性德', '龚自珍', '袁枚', '高鼎', '查慎行',
  '陶渊明', '屈原', '曹操', '曹植', '李煜', '温庭筠', '李煜',
  '汉乐府', '北朝民歌', '诗经', '南朝乐府',
]);
// 佚名/集体作品的题名白名单
const FAMOUS_TITLES = new Set([
  '木兰诗', '敕勒歌', '江南', '长歌行', '七步诗', '回乡偶书', '咏柳', '凉州词',
  '出塞', '从军行', '芙蓉楼送辛渐', '鹿柴', '竹里馆', '送元二使安西',
  '九月九日忆山东兄弟', '静夜思', '望庐山瀑布', '赠汪伦', '黄鹤楼送孟浩然之广陵',
  '早发白帝城', '望天门山', '春夜喜雨', '绝句', '春望', '江畔独步寻花', '游子吟',
  '江雪', '池上', '小池', '晓出净慈寺送林子方', '宿新市徐公店', '春日', '观书有感',
  '题临安邸', '游园不值', '村居', '所见', '竹石', '石灰吟', '过零丁洋', '己亥杂诗',
  '山行', '清明', '江南春', '泊秦淮', '秋夕', '商山早行', '无题', '锦瑟',
  '登鹳雀楼', '春晓', '悯农', '咏鹅', '相思', '关雎', '蒹葭',
]);
function sourceOf(i) { return corpus.sources[+corpus.lines[i].split('|')[1]] || ''; }
function isFamous(i) {
  const s = sourceOf(i).split('|');
  return FAMOUS_AUTHORS.has(s[1]) || FAMOUS_TITLES.has(s[0]);
}

// ---------------- 教材名篇（第一优先层）----------------
// 题名泛匹配会误伤冷门同题诗（如陈焕《梅花》），故对易撞名的题名用「题名|作者」精确配对。
// 命中此层的句子 = 教材必背/大众熟知的热门经典，正确句/拼句目标/AI 手牌最优先从这里抽。
const HOT_TITLES = new Set([
  // —— 小学必背（题名唯一性高，泛匹配安全）——
  '静夜思', '春晓', '望庐山瀑布', '赠汪伦', '黄鹤楼送孟浩然之广陵', '早发白帝城', '望天门山',
  '春夜喜雨', '绝句', '春望', '江畔独步寻花', '江雪', '池上', '小池', '晓出净慈寺送林子方',
  '宿新市徐公店', '观书有感', '题临安邸', '游园不值', '村居', '所见', '竹石', '石灰吟',
  '过零丁洋', '己亥杂诗', '山行', '清明', '江南春', '泊秦淮', '秋夕', '商山早行', '登鹳雀楼',
  '悯农', '咏鹅', '游子吟', '回乡偶书', '咏柳', '凉州词', '芙蓉楼送辛渐', '鹿柴', '竹里馆',
  '送元二使安西', '九月九日忆山东兄弟', '木兰诗', '敕勒歌', '江南', '长歌行', '七步诗',
  '枫桥夜泊', '忆江南', '暮江吟', '浪淘沙', '竹枝词', '乌衣巷', '望洞庭', '秋词', '泊船瓜洲',
  '书湖阴先生壁', '元日', '登飞来峰', '饮湖上初晴后雨', '题西林壁', '夏日绝句', '示儿',
  '秋夜将晓出篱门迎凉有感', '十一月四日风雨大作', '游山西村', '临安春雨初霁', '雪梅',
  '宿建德江', '过故人庄', '望洞庭湖赠张丞相', '早寒江上有怀', '次北固山下', '送杜少府之任蜀州',
  '使至塞上', '闻王昌龄左迁龙标遥有此寄', '渡荆门送别', '行路难', '将进酒', '蜀道难',
  '月下独酌', '望月怀远', '黄鹤楼', '登岳阳楼', '旅夜书怀', '登高', '望岳', '赋得古原草送别',
  '钱塘湖春行', '卖炭翁', '观刈麦', '雁门太守行', '赤壁', '夜雨寄北', '嫦娥', '霜月',
  '夜宿山寺', '独坐敬亭山', '秋浦歌', '送友人', '宣州谢朓楼饯别校书叔云', '宣州谢脁楼饯别校书叔云',
  '题都城南庄', '再游玄都观', '石头城', '白雪歌送武判官归京', '别董大', '逢入京使',
  '山居秋暝', '终南别业', '汉江临泛', '新晴野望', '归嵩山作', '鸟鸣涧', '天净沙', '山坡羊',
  '晚春', '大林寺桃花', '菊花', '蜂', '画', '风', '村晚', '舟夜书所见', '夜书所见',
  '论诗', '冬夜读书示子聿', '观书', '对酒', '苔', '咏煤炭', '送灵澈上人', '归雁',
  // —— 初高中必背 + 大众熟知词牌（易撞名，用「题名|作者」精确配对）——
  '水调歌头|苏轼', '念奴娇|苏轼', '江城子|苏轼', '卜算子|苏轼', '卜算子|陆游', '定风波|苏轼',
  '浣溪沙|晏殊', '浣溪沙|苏轼', '浣溪沙|纳兰性德', '蝶恋花|晏殊', '蝶恋花|柳永',
  '蝶恋花|欧阳修', '蝶恋花|纳兰性德', '清平乐|辛弃疾', '清平乐|黄庭坚', '破阵子|辛弃疾',
  '破阵子|晏殊', '西江月|辛弃疾', '青玉案|辛弃疾', '贺新郎|辛弃疾', '丑奴儿|辛弃疾',
  '菩萨蛮|辛弃疾', '菩萨蛮|温庭筠', '虞美人|李煜', '相见欢|李煜', '浪淘沙令|李煜',
  '一剪梅|李清照', '醉花阴|李清照', '如梦令|李清照', '渔家傲|李清照', '渔家傲|范仲淹',
  '苏幕遮|范仲淹', '苏幕遮|周邦彦', '武陵春|李清照', '点绛唇|姜夔', '满江红|岳飞',
  '无题|李商隐', '锦瑟|李商隐', '出塞|王昌龄', '从军行|王昌龄', '从军行|杨炯',
  '凉州词|王之涣', '凉州词|王翰', '梅花|王安石', '春日|朱熹', '绝句|杜甫', '绝句|释志南',
  '绝句二首|杜甫', '杂诗|曹丕', '杂诗|陶渊明', '送别|王维', '马诗|李贺',
  '长恨歌|白居易', '琵琶行|白居易', '子夜吴歌|李白', '关山月|李白',
]);
function isHot(i) {
  const s = sourceOf(i).split('|');
  return HOT_TITLES.has(s[0]) || HOT_TITLES.has(s[0] + '|' + s[1]);
}

// ---------------- 核心名句（第零层，逐句人工精选）----------------
// 教训（2026-11-18 真机三图反馈）：题名级白名单挡不住长诗冷句——《长恨歌》120 句全在层内，
// 「回头下望人寰处」「主人何为言少钱」也会被抽到。本层只收真正耳熟能详的名句，
// 全部经 build 时校验在库且含对应令字；正确句/拼句目标/AI 手牌第零优先从这里抽。
const FAMOUS_LINES = {
  人: ['要留清白在人间','人生自古谁无死','物是人非事事休','谁道人生无再少','为伊消得人憔悴','人比黄花瘦','暖风熏得游人醉','遍插茱萸少一人','古来征战几人回','万里长征人未还','天下谁人不识君','恐惊天上人','人间四月芳菲尽','江清月近人','人生得意须尽欢','白云生处有人家','对影成三人','万径人踪灭','路上行人欲断魂','同是天涯沦落人','人面桃花相映红','人面不知何处去','人闲桂花落','空山不见人','但闻人语响','故人西辞黄鹤楼','烟波江上使人愁','岁月不待人','乱花渐欲迷人眼','深林人不知','落日故人情','故人具鸡黍','生当作人杰','试问卷帘人','昔人已乘黄鹤去','夜半无人私语时','天上人间会相见'],
  山: ['咬定青山不放松','千锤万凿出深山','山外青山楼外楼','不识庐山真面目','只缘身在此山中','山重水复疑无路','山色空蒙雨亦奇','青海长云暗雪山','明月出天山','一片孤城万仞山','不教胡马度阴山','巴山夜雨涨秋池','却话巴山夜雨时','山寺桃花始盛开','空山新雨后','远上寒山石径斜','轻舟已过万重山','国破山河在','两岸青山相对出','一览众山小','遥望洞庭山水翠','姑苏城外寒山寺','水村山郭酒旗风','千山鸟飞绝','白日依山尽','山回路转不见君','平明送客楚山孤','青山郭外斜','远看山有色','夜静春山空','月出惊山鸟','山随平野尽','只有敬亭山','飞来山上千寻塔','山河破碎风飘絮','我见青山多妩媚','关山度若飞'],
  风: ['夜来风雨声','随风潜入夜','春风又绿江南岸','二月春风似剪刀','春风不度玉门关','忽如一夜春风来','北风卷地白草折','长风破浪会有时','东风无力百花残','东风不与周郎便','桃花依旧笑春风','吹面不寒杨柳风','忙趁东风放纸鸢','春风吹又生','风吹草低见牛羊','北风吹雁雪纷纷','暖风熏得游人醉','风景旧曾谙','小楼昨夜又东风','风住尘香花已尽','昨夜西风凋碧树','也无风雨也无晴','等闲识得东风面','春风送暖入屠苏','潭面无风镜未磨','风正一帆悬','风急天高猿啸哀','任尔东西南北风','长风几万里'],
  月: ['床前明月光','举头望明月','海上生明月','举杯邀明月','月落乌啼霜满天','秦时明月汉时关','明月松间照','明月何时照我还','八千里路云和月','春花秋月何时了','月涌大江流','我寄愁心与明月','烟花三月下扬州','露似真珠月似弓','湖光秋月两相和','烟笼寒水月笼沙','明月来相照','月出惊山鸟','江清月近人','别时茫茫江浸月','唯见江心秋月白','莫使金樽空对月','欲上青天揽明月','霜叶红于二月花','烽火连三月','可怜九月初三夜','明月几时有','沧海月明珠有泪'],
  春: ['春眠不觉晓','春风又绿江南岸','春色满园关不住','万紫千红总是春','春风送暖入屠苏','春蚕到死丝方尽','春来江水绿如蓝','当春乃发生','城春草木深','春风不度玉门关','二月春风似剪刀','报得三春晖','忽如一夜春风来','春风吹又生','桃花依旧笑春风','长恨春归无觅处','夜静春山空','春花秋月何时了','流水落花春去也','铜雀春深锁二乔','谁家新燕啄春泥','春潮带雨晚来急','病树前头万木春','阳春布德泽','梅雪争春未肯降','春去花还在','春宵一刻值千金','春城无处不飞花'],
  花: ['花落知多少','感时花溅泪','花重锦官城','黄四娘家花满蹊','桃花潭水深千尺','乱花渐欲迷人眼','采得百花成蜜后','千树万树梨花开','映日荷花别样红','飞入菜花无处寻','人闲桂花落','烟花三月下扬州','牧童遥指杏花村','隔江犹唱后庭花','日出江花红胜火','霜叶红于二月花','无可奈何花落去','柳暗花明又一村','花自飘零水自流','朱雀桥边野草花','人面桃花相映红','桃花依旧笑春风','东风无力百花残','不是花中偏爱菊','我花开后百花杀','春去花还在','花间一壶酒','沾衣欲湿杏花雨','竹外桃花三两枝','稻花香里说丰年'],
  天: ['疑是银河落九天','天门中断楚江开','天生我材必有用','天涯若比邻','天涯共此时','月落乌啼霜满天','一行白鹭上青天','曲项向天歌','恐惊天上人','野旷天低树','接天莲叶无穷碧','天光云影共徘徊','望尽天涯路','天下谁人不识君','归雁入胡天','碧海青天夜夜心','天阶夜色凉如水','江流天地外','唯见长江天际流','欲上青天揽明月','风急天高猿啸哀','天地一沙鸥','同是天涯沦落人','在天愿作比翼鸟','天长地久有时尽','草长莺飞二月天'],
  水: ['白毛浮绿水','桃花潭水深千尺','烟笼寒水月笼沙','水光潋滟晴方好','山重水复疑无路','花自飘零水自流','春来江水绿如蓝','抽刀断水水更流','一道残阳铺水中','碧水东流至此回','遥望洞庭山水翠','水村山郭酒旗风','行到水穷处','近听水无声','门前流水尚能西','为有源头活水来','胜日寻芳泗水滨','天阶夜色凉如水','八月湖水平','仍怜故乡水','水面初平云脚低','树阴照水爱晴柔','一水护田将绿绕','京口瓜洲一水间','流水落花春去也'],
};
const TOP_LINE_SET = new Set(
  Object.keys(FAMOUS_LINES).flatMap(ch =>
    FAMOUS_LINES[ch].filter(t => t.indexOf(ch) !== -1 && corpus.norm_index[normKey(t)] !== undefined)
  )
);
function isTop(i) { return TOP_LINE_SET.has(lineText(i)); }

/** 干扰字常用字表（拼句干扰块专用，杜绝生僻字） */
const COMMON_DISTRACT = [
  '云', '江', '雪', '夜', '心', '秋', '柳', '舟', '霜', '雁', '灯', '空',
  '林', '声', '鸟', '啼', '门', '树', '楼', '台', '客', '清', '波', '明',
  '白', '千', '里', '孤', '帆', '岸', '村', '烟', '雨', '桥', '钟', '梦',
  '笛', '酒', '歌', '舞', '城', '宫', '衣', '马',
].filter(ch => POOL.indexOf(ch) === -1);

/** 字池中某字剩余可用句（未用、含字） */
function remaining(corpus, keyword, usedKeys) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  return (corpus.char_index[keyword] || []).filter(i => !used.has(lineText(i)));
}

/**
 * 挑一条正确句（未用、含关键字）。
 * easy 档：核心名句层内优先五言（更好认好拼）。困难档：核心名句层内优先七言
 * （2026-11-20 真机复盘二改——「教材名篇冷句」路线被真机打回，困难 ≠ 冷僻）。
 * 每档四级经典偏好（≥6 句才整层采用，不足逐层下沉，保证永不空池）：
 *   tier0 核心名句（isTop，人工精选）/ tier1 教材名篇（isHot）/ tier2 名家名篇（isFamous）/ tier3 全库兜底
 */
function pickCorrect(keyword, usedKeys, rng, preferFamous, easy) {
  const pool = remaining(corpus, keyword, usedKeys);
  if (!pool.length) return null;
  if (preferFamous !== false) {
    const top = pool.filter(isTop);
    if (easy) {
      // 简单档：核心名句层内再优先五言短句（更好认好拼）
      const top5 = top.filter(i => lineText(i).length === 5);
      if (top5.length >= 6) return top5[Math.floor(rng() * top5.length)];
      if (top.length >= 6) return top[Math.floor(rng() * top.length)];
      const hot = pool.filter(isHot);
      if (hot.length >= 6) return hot[Math.floor(rng() * hot.length)];
    } else {
      // 困难档（2026-11-20 真机复盘二改）：首版「绕开 tier0 从教材名篇起步」被真机打回——
      // HOT_TITLES 是题名级白名单，整首《登岳阳楼》《浪淘沙》都在层内，抽出的
      // 「戎马关山北」「昔闻洞庭水」「照花前后镜」是玩家根本没背过的冷句，
      // 择句模式里无法与假句区分，实际体验是"一题都答不出来"。困难 ≠ 冷僻。
      // 现改为 tier0 核心名句内**七言优先**：认句更难 + 字块模式多两块要拼；
      // 五言核心名句留给简单档。教材名篇冷句降为 tier0 耗尽后的兜底。
      const top7 = top.filter(i => lineText(i).length === 7);
      if (top7.length >= 6) return top7[Math.floor(rng() * top7.length)];
      if (top.length >= 6) return top[Math.floor(rng() * top.length)];
      const hot = pool.filter(isHot);
      if (hot.length >= 6) return hot[Math.floor(rng() * hot.length)];
    }
    const fam = pool.filter(isFamous);
    if (fam.length >= 6) return fam[Math.floor(rng() * fam.length)];
    if (top.length >= 6) return top[Math.floor(rng() * top.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

/** 关键字邻域字池：含关键字句子中的真实汉字（排除本句已用字）——干扰字兜底池 */
function neighborhoodChars(keyword, excludeSet, rng) {
  const ids = (corpus.char_index[keyword] || []).slice();
  const chars = [];
  const step = Math.max(1, Math.floor(ids.length / 40));
  for (let i = 0; i < ids.length; i += step) {
    for (const ch of lineText(ids[Math.floor(rng() * ids.length)])) {
      if (!excludeSet.has(ch) && chars.indexOf(ch) === -1) chars.push(ch);
    }
  }
  return chars;
}

/** 干扰字候选池：常用字优先，邻域兜底；排除本句字 */
function distractPool(keyword, inSentence, rng) {
  const out = COMMON_DISTRACT.filter(ch => !inSentence.has(ch));
  for (const ch of neighborhoodChars(keyword, inSentence, rng)) {
    if (out.indexOf(ch) === -1 && COMMON_DISTRACT.indexOf(ch) === -1) out.push(ch);
  }
  return out;
}

/**
 * ★ 字块不变量校验：8 块多重集（句字 + 干扰字）中，任何 5/7 字排列若含干扰字，
 * 其 norm_key 不得命中句库。递归枚举（P(8,7)+ΣC(8,5)·5! ≈ 4.7 万节点，毫秒级）。
 * @returns {boolean} true = 存在违例排列（不可用）
 */
function hasForbiddenArrangement(multiset, sentence) {
  const n = multiset.length;
  const used = new Array(n).fill(false);
  let violation = false;
  function dfs(path) {
    if (violation) return;
    const len = path.length;
    if (len === 5 || len === 7) {
      const key = path.join('');
      if (key !== sentence && corpus.norm_index[key] !== undefined) { violation = true; return; }
    }
    if (len === 7) return; // 8 块最长只查到 7（库内句长只有 5/7）
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; path.push(multiset[i]);
      dfs(path);
      path.pop(); used[i] = false;
      if (violation) return;
    }
  }
  dfs([]);
  return violation;
}

/**
 * 生成库外假句（含关键字、5/7 言、norm_key 不命中）。
 * 2026-11-18 P0（产品评估实测：原实现拼随机常用字，可读性差且生成常失败，
 * 导致 100% 回合只有 1 个含令字选项 → 「择句」退化成找字测试）：
 * 改为「名句改字」——从含令字的真实名句出发，邻字互换或替换一个非令字，
 * 造出读起来像诗但库里没有的伪句。玩家必须真的认得这句诗才能分辨。
 */
function genFakeLine(keyword, exclude, rng) {
  const ids = corpus.char_index[keyword] || [];
  const tiers = [
    ids.filter(isTop),
    ids.filter(isHot),
    ids.filter(isFamous),
    ids,
  ];
  for (const tier of tiers) {
    if (!tier.length) continue;
    for (let g = 0; g < 60; g++) {
      const src = lineText(tier[Math.floor(rng() * tier.length)]);
      const arr = src.split('');
      let cand = null;
      if (rng() < 0.5) {
        // 邻字互换（语序错乱）：最像"记错了"的错法
        const poss = [];
        for (let i = 0; i < arr.length - 1; i++) if (arr[i] !== arr[i + 1]) poss.push(i);
        if (!poss.length) continue;
        const i = poss[Math.floor(rng() * poss.length)];
        const t = arr.slice();
        const tmp = t[i]; t[i] = t[i + 1]; t[i + 1] = tmp;
        cand = t.join('');
      } else {
        // 替换一个非令字为常用字（一字之差）
        const idxs = [];
        for (let i = 0; i < arr.length; i++) if (arr[i] !== keyword) idxs.push(i);
        if (!idxs.length) continue;
        const i = idxs[Math.floor(rng() * idxs.length)];
        const pool = COMMON_DISTRACT.filter(ch => ch !== keyword && arr.indexOf(ch) === -1);
        if (!pool.length) continue;
        const t = arr.slice();
        t[i] = pool[Math.floor(rng() * pool.length)];
        cand = t.join('');
      }
      if (!cand || cand === src) continue;
      if (cand.indexOf(keyword) === -1) continue;
      if (cand.length !== 5 && cand.length !== 7) continue;
      if (corpus.norm_index[normKey(cand)] !== undefined) continue;
      if (exclude.has(cand)) continue;
      return cand;
    }
  }
  return null;
}

/**
 * 字块拼句：5 言 → 5 正 + 3 干扰；7 言 → 7 正 + 1 干扰
 * 目标句名家优先；干扰字常用字优先、不入本句、互不重复；组合需通过 ★ 不变量校验
 * 返回 { lineIdx, sentence, blocks: [{char, distractor}] }
 */
function genBlocks(keyword, usedKeys, rng, easy) {
  // 毒句重试（2026-11-20）：个别句（如「只缘身在此山中」）与库内大量真句共享常用字组合，
  // 加任何干扰字都有违例排列 → 干扰字选不满。此时把该句加入局部已用集合换句重试，
  // 不动调用方的全局 usedKeys。此前一次失败直接返回 null，blocks 模式会提前进 poolEmpty。
  const localUsed = new Set(usedKeys instanceof Set ? usedKeys : new Set(usedKeys));
  for (let attempt = 0; attempt < 4; attempt++) {
    const correctIdx = pickCorrect(keyword, localUsed, rng, undefined, easy);
    if (correctIdx == null) return null;
    const sentence = lineText(correctIdx);
    const nDistract = sentence.length === 5 ? 3 : 1;
    const inSentence = new Set(sentence);
    const hood = shuffled(distractPool(keyword, inSentence, rng), rng);

    const chosen = [];
    let cursor = 0;
    let guard = 0;
    while (chosen.length < nDistract && guard < 200) {
      guard++;
      const ch = hood[cursor++ % hood.length];
      if (chosen.indexOf(ch) !== -1) continue;
      // 试探：当前组合 + 该字是否仍满足不变量
      const trial = chosen.concat(ch);
      const multiset = sentence.split('').concat(trial);
      if (hasForbiddenArrangement(multiset, sentence)) continue; // 该字引入违例排列，弃用
      chosen.push(ch);
    }
    if (chosen.length >= nDistract) {
      const blocks = shuffled(
        sentence.split('').map(ch => ({ char: ch, distractor: false }))
          .concat(chosen.map(ch => ({ char: ch, distractor: true }))),
        rng
      );
      return { lineIdx: correctIdx, sentence, blocks, src: sourceOf(correctIdx) };
    }
    localUsed.add(sentence); // 毒句：换一句重试
  }
  return null; // 连续 4 句均不可组块（理论极罕见）
}

/**
 * 点选接句候选：1 正确 + 3 干扰（candidateCount 可配置）
 * ★ 干扰项必须 judge 判不通过——noKw(不含字真句) / dup(已用句) / fake(库外拼合句)
 * 生成期逐条 judge 复核，意外放行的干扰弃用并回填
 * 返回 { correctIdx, options: [{text, kind, lineIdx?}], correctPos }
 * kind: 'correct' | 'noKw' | 'dup' | 'fake'
 */
function genChoiceCandidates(keyword, usedKeys, rng, candidateCount, easy) {
  const N = candidateCount || 4;
  const correctIdx = pickCorrect(keyword, usedKeys, rng, undefined, easy);
  if (correctIdx == null) return null;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys);
  const correctText = lineText(correctIdx);
  const seen = new Set([correctText]);
  const opts = [];

  // 2026-11-18 用户反馈「还是有重复」：dup 干扰（已用句出现在选项）被玩家理解为
  // 题目重复——已用句一律不再进入选项，干扰只从 noKw / fake 生成。
  // judge 对已用句的 DUPLICATE 拦截仍在（字块手拼、AI 出句等路径完整跑 judge）。

  // ★ 2026-11-18 P0 可判别性修复：伪句必出（简单 1 个 / 普通 2 个），
  //   保证每回合 ≥2 个选项含令字——否则"找带关键字那张卡"就能全对，
  //   玩法退化成找字测试（产品评估实测 100% 回合只有 1 个含字选项）。
  const fakeTarget = Math.min(N - 1, easy ? 1 : 2);
  const fakeExclude = new Set([...seen, ...used]);
  for (let i = 0; i < fakeTarget; i++) {
    const fake = genFakeLine(keyword, fakeExclude, rng);
    if (!fake) break;
    fakeExclude.add(fake); seen.add(fake);
    opts.push({ text: fake, kind: 'fake' });
  }

  // noKw 迷惑项：库内真实句但不含关键字（先名篇，再名家，最后放宽）
  function pushNoKw(strict) {
    for (let g = 0; g < 80; g++) {
      const i = Math.floor(rng() * corpus.lines.length);
      const t = lineText(i);
      if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
      if (t.length !== 5 && t.length !== 7) continue;
      if (strict && !isFamous(i)) continue;
      seen.add(t); opts.push({ text: t, kind: 'noKw' });
      return true;
    }
    return false;
  }
  function pushNoKwHot() {
    for (let g = 0; g < 120; g++) {
      const i = Math.floor(rng() * corpus.lines.length);
      const t = lineText(i);
      if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
      if (t.length !== 5 && t.length !== 7) continue;
      if (!isHot(i)) continue;
      seen.add(t); opts.push({ text: t, kind: 'noKw' });
      return true;
    }
    return false;
  }
  while (opts.length < N - 1) {
    if (pushNoKwHot()) continue;
    if (pushNoKw(true)) continue;
    if (pushNoKw(false)) continue;
    break;
  }

  // 3) fake 补足：库外拼合句（含关键字）
  while (opts.length < N - 1) {
    const fake = genFakeLine(keyword, seen, rng);
    if (!fake) break;
    seen.add(fake); opts.push({ text: fake, kind: 'fake' });
  }

  // 4) 生成期铁证：干扰项必须 judge fail；意外放行的弃用（理论不可达，防手滑）
  const pool = corpus.pool || POOL;
  const verified = opts.filter(o => !judge(o.text, keyword, used, pool).pass);
  while (verified.length < N - 1) {
    const fake = genFakeLine(keyword, seen, rng);
    if (!fake) break;
    seen.add(fake); verified.push({ text: fake, kind: 'fake' });
  }

  const all = [{ text: correctText, kind: 'correct', lineIdx: correctIdx }].concat(verified);
  const order = shuffled(all, rng);
  return { correctIdx, options: order, correctPos: order.findIndex(o => o.kind === 'correct') };
}

// ---------------- 教学局（P0-3「首 90 秒」）----------------
/**
 * 3 回合教学局：固定令字「月」，三句全是国民级名句。
 * 递进设计（不解释规则，用三次体验教完规则）：
 *   第 1 回合 把答案念给玩家听 → 必成，建立"我点一下就对"的手感；
 *   第 2 回合 只给出处（作者《诗题》）→ 玩家自己想起原句，学会用提示；
 *   第 3 回合 不给提示 + 诗童必失手 → 第一次"赢"的哇时刻，同时暴露"假句"存在。
 * fake 全部是「正确的邻字互换」（床前明月光 → 床前月光明），
 * 让玩家在第 1 回合就看见「长得像但不是原句」的干扰项——这是 P0-1 后的核心玩法。
 */
const TUTORIAL_ROUNDS = [
  { line: '床前明月光', fake: '床前月光明', hint: '第一句我念给你听：床前明月光', tip: '对 · 每回合你和诗童各接一句' },
  { line: '海上生明月', fake: '海上明月生', hint: '出自 张九龄《望月怀远》', tip: '有改过字的假句，要选真句' },
  { line: '月落乌啼霜满天', fake: '月落乌啼满天霜', hint: '最后一句，靠你自己', tip: '诗童没接上 · 教学局完成' },
];

/** 取一条库内真句但不含令字（noKw 干扰），名篇优先 */
function pickNoKw(keyword, seen, rng, strict) {
  for (let g = 0; g < 120; g++) {
    const i = Math.floor(rng() * corpus.lines.length);
    const t = lineText(i);
    if (t.indexOf(keyword) !== -1 || seen.has(t)) continue;
    if (t.length !== 5 && t.length !== 7) continue;
    if (strict && !isHot(i) && !isFamous(i)) continue;
    return t;
  }
  return null;
}

/**
 * 生成教学局第 step（0 基）回合的选项。
 * 返回与 genChoiceCandidates 同形：{ correctIdx, options:[{text,kind}], correctPos, tutorial:{step,hint,tip} }
 * 库内缺句（理论不可达）返回 null，调用方回落常规发牌。
 */
function genTutorialRound(step, keyword, usedKeys, rng) {
  const spec = TUTORIAL_ROUNDS[Math.max(0, Math.min(TUTORIAL_ROUNDS.length - 1, step | 0))];
  const correctIdx = corpus.norm_index[normKey(spec.line)];
  if (correctIdx === undefined) return null;
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys || []);
  if (used.has(spec.line)) return null; // 该句已用（教学局不会发生，防御式）

  const opts = [{ text: spec.line, kind: 'correct', lineIdx: correctIdx }];
  const seen = new Set([spec.line]);

  // 伪句：库外改字句（含令字）；万一与库撞名则临时生成
  let fake = spec.fake;
  if (!fake || corpus.norm_index[normKey(fake)] !== undefined || seen.has(fake)) {
    fake = genFakeLine(keyword, seen, rng);
  }
  if (fake) { seen.add(fake); opts.push({ text: fake, kind: 'fake' }); }

  // 两条 noKw 真句（不含令字），名篇/名家优先，保证"每个选项都像诗"
  let noKw = pickNoKw(keyword, seen, rng, true);
  if (noKw) { seen.add(noKw); opts.push({ text: noKw, kind: 'noKw' }); }
  noKw = pickNoKw(keyword, seen, rng, false);
  if (noKw) { seen.add(noKw); opts.push({ text: noKw, kind: 'noKw' }); }

  const order = shuffled(opts, rng);
  return {
    correctIdx,
    options: order,
    correctPos: order.findIndex(o => o.kind === 'correct'),
    tutorial: { step: step + 1, hint: spec.hint, tip: spec.tip, line: spec.line },
  };
}

module.exports = { mulberry32, shuffled, pickCorrect, remaining, neighborhoodChars, distractPool, hasForbiddenArrangement, genChoiceCandidates, genBlocks, genFakeLine, genTutorialRound, TUTORIAL_ROUNDS, lineText, isFamous, isHot, isTop, FAMOUS_LINES, COMMON_DISTRACT };
