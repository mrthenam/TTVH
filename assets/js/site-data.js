/* ============================================================
   Thịnh Thế Vinh Hoa — Nội dung trang chủ (data layer)
   Các section render theo dữ liệu ở đây. Section nào mảng rỗng
   thì tự ẩn — trang công khai không bao giờ hiện "đang cập nhật".

   QUY TẮC: chỉ điền dữ liệu ĐÃ XÁC MINH. Không đặt số ước lượng.
   ============================================================ */
window.SITE_DATA = (function () {
  'use strict';

  /* ---------- Dữ kiện doanh nghiệp ----------
     Chỉ liệt kê điều chắc chắn đúng. Dải này chỉ hiện khi có >= 2 mục.
     Khi có số liệu thật (điểm bán, tỉnh thành, năm thành lập), thêm vào đây. */
  var facts = [
    { value: '04', label: 'Thương hiệu trong hệ sinh thái' },
    { value: 'TP.HCM', label: 'Trụ sở chính' }
    // { value: 'XX+',  label: 'Điểm bán trên toàn quốc' },
    // { value: 'XX',   label: 'Tỉnh thành có mặt' },
    // { value: '20XX', label: 'Khởi đầu hành trình' }
  ];

  /* ---------- Hệ sinh thái thương hiệu ---------- */
  var brands = [
    {
      slug: 'maycha',
      name: 'MAYCHA',
      category: 'Trà sữa',
      accent: 'var(--brand-maycha)',
      statement: 'Hạnh phúc trong từng lần hút.',
      description:
        'Một trong những thương hiệu trà sữa “top of mind” của giới trẻ với sản phẩm chất lượng, ' +
        'liên tục sáng tạo và mức giá hợp lý.',
      logo: 'images/logos/maycha.png',
      social: { label: 'Facebook', url: 'https://www.facebook.com/maycha38' }
    },
    {
      slug: 'tam-hao',
      name: 'Tam Hảo',
      fullName: 'Hồng Trà Sữa Tam Hảo',
      category: 'Hồng trà sữa',
      accent: 'var(--brand-tamhao)',
      statement: 'Hảo trà — Hảo giá — Hảo tâm.',
      description:
        'Hồng trà sữa truyền thống, vị đậm đà và ấm áp. Tên gọi bắt nguồn từ “Tam Hảo” (三好) — ' +
        'ba điều tốt đẹp mà thương hiệu cam kết giữ trong từng ly trà.',
      logo: 'images/logos/tamhao.png',
      social: { label: 'Facebook', url: 'https://www.facebook.com/hongtrasuatamhao' }
    },
    {
      slug: 'tra-hu',
      name: 'Trà Hú',
      fullName: 'Trà Hú — Đậm Hú Hồn',
      category: 'Trà sữa',
      accent: 'var(--brand-trahu)',
      statement: 'Đậm hú hồn.',
      description:
        'Thương hiệu trà sữa phong cách trẻ trung, không gian hoài niệm và đồ uống đậm vị. ' +
        'Nổi bật với trải nghiệm tự build ly trà — mix tối đa 8 loại topping.',
      logo: 'images/logos/trahu.png',
      social: { label: 'Facebook', url: 'https://www.facebook.com/trahu.damhuhon' }
    },
    {
      slug: 'ga-gion-sot',
      name: 'Gà Giòn Sốt',
      fullName: 'Gà Giòn Sốt Ba Cô Gái',
      category: 'Gà giòn',
      accent: 'var(--brand-gagion)',
      statement: 'Gà giòn rụm, sốt lắc đậm vị.',
      description:
        'Món mặn chủ lực của hệ sinh thái, nổi tiếng với combo da gà và sụn gà sốt Mala độc bản, ' +
        'kết hợp cùng đồ uống giải khát.',
      logo: 'images/logos/garan.png',
      social: { label: 'Facebook', url: 'https://www.facebook.com/gagionsot.bacogai' }
    }
  ];

  /* ---------- Năng lực vận hành ---------- */
  var capabilities = [
    {
      title: 'Phát triển thương hiệu',
      desc: 'Định vị, bản sắc và câu chuyện riêng cho từng thương hiệu trong hệ sinh thái.'
    },
    {
      title: 'Nghiên cứu & phát triển sản phẩm',
      desc: 'Xây dựng công thức, chuẩn hoá định lượng và phát triển menu theo mùa.'
    },
    {
      title: 'Sản xuất & chuỗi cung ứng',
      desc: 'Tổ chức nguồn nguyên liệu và luân chuyển hàng hoá tới từng điểm bán.'
    },
    {
      title: 'Vận hành cửa hàng',
      desc: 'Quy trình phục vụ, kiểm soát chất lượng và trải nghiệm nhất quán tại quầy.'
    },
    {
      title: 'Đào tạo nhân sự',
      desc: 'Huấn luyện tay nghề và lộ trình phát triển cho đội ngũ tại cửa hàng lẫn văn phòng.'
    },
    {
      title: 'Phát triển hệ thống',
      desc: 'Tìm kiếm mặt bằng, mở rộng điểm bán và đồng hành cùng đối tác.'
    }
  ];

  /* ---------- Hành trình ----------
     CHƯA CÓ DỮ LIỆU ĐƯỢC XÁC MINH → section tự ẩn.
     Khi có mốc thật, thêm { year: '2018', title: '…', desc: '…' } vào đây. */
  var timeline = [];

  /* ---------- Giá trị cốt lõi ---------- */
  var values = [
    { title: 'Chất lượng', desc: 'Nguyên liệu tuyển chọn, quy trình chuẩn ở mọi điểm bán.' },
    { title: 'Hương vị', desc: 'Mỗi thương hiệu một dấu ấn riêng, không trộn lẫn.' },
    { title: 'Tận tâm', desc: 'Phục vụ bằng cái tâm — đúng như tinh thần Tam Hảo.' },
    { title: 'Phát triển', desc: 'Mở rộng bền vững, tạo cơ hội để đội ngũ cùng lớn lên.' }
  ];

  /* ---------- Thông tin liên hệ ---------- */
  var contact = {
    address: 'Số 35 đường Huỳnh Tịnh Của, phường Xuân Hòa, TP. Hồ Chí Minh',
    hotline: { label: '028 7108 0719', href: 'tel:02871080719' },
    email: { label: 'hr@maycha.com.vn', href: 'mailto:hr@maycha.com.vn' },
    careersUrl: 'https://vieclamthinhthevinhhoa.com.vn/',
    jobsUrl: 'https://vieclamthinhthevinhhoa.com.vn/viec-lam.html',
    mapEmbed:
      'https://www.google.com/maps?q=S%E1%BB%91%2035%20%C4%91%C6%B0%E1%BB%9Dng%20Hu%E1%BB%B3nh%20T%E1%BB%8Bnh%20C%E1%BB%A7a%2C%20ph%C6%B0%E1%BB%9Dng%20Xu%C3%A2n%20H%C3%B2a%2C%20H%E1%BB%93%20Ch%C3%AD%20Minh%2C%20Vietnam&output=embed',
    mapLink:
      'https://www.google.com/maps/search/?api=1&query=S%E1%BB%91%2035%20%C4%91%C6%B0%E1%BB%9Dng%20Hu%E1%BB%B3nh%20T%E1%BB%8Bnh%20C%E1%BB%A7a%2C%20ph%C6%B0%E1%BB%9Dng%20Xu%C3%A2n%20H%C3%B2a%2C%20H%E1%BB%93%20Ch%C3%AD%20Minh'
  };

  return {
    facts: facts,
    brands: brands,
    capabilities: capabilities,
    timeline: timeline,
    values: values,
    contact: contact
  };
})();
