# 抗磁悬浮电磁旋转粘度计 — AI 背景知识库

## 1. 装置概述

本装置是一种基于抗磁悬浮原理的电磁旋转式气体粘度计。核心设计思想是利用高定向热解石墨（HOPG）的强抗磁性实现探针的无接触悬浮，通过旋转磁场产生非接触电磁驱动力矩，利用视频分析技术检测探针转速，最终通过转速比与粘度的线性关系实现气体粘度的精密测量。

### 关键材料参数

- HOPG 磁化率：$\chi \approx -4 \times 10^{-4}$（强抗磁性）
- 铝盘厚度：$d \approx 0.1$ mm（远小于半径 $R$，电导率 $\sigma \approx 3.77 \times 10^7$ S/m）
- 探针盘-基座间隙：$h \ll R$（典型值约 0.5-2 mm）
- NdFeB 基座磁铁：径向充磁嵌套结构，提供轴对称非均匀磁场
- 驱动磁铁：四极方形磁铁，步进电机驱动，转速 $\Omega_M$ 可调

### 装置组件

1. **基座磁铁系统**：两个径向充磁 NdFeB 磁铁嵌套组合，增强磁场轴对称性，抑制电磁制动扭矩
2. **悬浮探针**：HOPG 石墨圆盘 + 紧贴的铝质圆盘，表面有黑色标记线用于转速检测
3. **驱动系统**：步进电机 + 四块方形磁铁（四极结构），产生 $n=2$ 的旋转磁场
4. **密封样品腔**：亚克力桶，可抽真空至 < 0.2 bar 后注入待测气体，换气三次保证纯度
5. **视频采集**：手机/工业相机从顶部拍摄探针旋转过程，建议 60fps 以上
6. **间距调节机构**：驱动磁铁与基座磁铁间距可调，优化磁场耦合效率

---

## 2. 物理原理详解

### 2.1 抗磁悬浮原理

抗磁性材料在外磁场中被磁化，产生与外磁场方向相反的磁化强度 $\mathbf{M} = \chi \mathbf{H}$（$\chi < 0$）。在非均匀磁场中，抗磁性物体受到的力为：

$$\mathbf{F} = \nabla(\mathbf{m} \cdot \mathbf{B}) \propto \chi \nabla(B^2)$$

对于 $\chi < 0$ 的材料，力指向磁场强度减小的方向。HOPG 的强抗磁性（$\chi \approx -4 \times 10^{-4}$，在所有室温材料中仅次于超导体）使其在 NdFeB 永磁体上方能稳定悬浮。

根据 Earnshaw 定理，仅靠静磁力无法实现稳定悬浮。但抗磁性材料的负磁化率打破了这一限制：在磁场强度极小值处，抗磁体受到指向中心的恢复力，与重力平衡后可形成稳定势阱。具体地，系统势能为：

$$U = mgz - \frac{\chi}{2\mu_0} B^2$$

平衡条件 $\partial U/\partial z = 0$ 和稳定条件 $\partial^2 U/\partial z^2 > 0$ 均可满足。

### 2.2 电磁驱动扭矩推导

采用柱坐标系 $(r, \theta, z)$，铝盘位于 $z=0$ 平面。

#### 基本假设

- 铝盘极薄：$d \ll R$，忽略厚度方向电流变化
- 磁场径向变化缓慢：$B(r) \approx B_0$
- 忽略铝盘涡流对原磁场的反作用（弱耦合近似）
- 趋肤深度远大于 $d$，磁场完全穿透
- 准静态近似：频率范围使法拉第定律适用
- 垂直电场 $E_z \approx 0$（良导体薄盘中表面电荷迅速屏蔽）

#### 磁场表达式

驱动磁铁（四极结构，$n=2$）以角速度 $\Omega_M$ 旋转，在铝盘处产生 $z$ 方向磁通密度：

$$B_z(r, \theta, t) = B_0 e^{i(\Omega_M t - 2\theta)}$$

物理场取实部，$\propto \cos(\Omega_M t - 2\theta)$。

#### 感应电场

由法拉第定律 $\nabla \times \mathbf{E} = -\partial \mathbf{B}/\partial t$，引入标势 $\Phi(r, \theta)$ 使得：

$$E_r = \frac{1}{r}\frac{\partial \Phi}{\partial \theta}, \quad E_\theta = -\frac{\partial \Phi}{\partial r}, \quad E_z = 0$$

该形式自动满足 $\nabla \cdot \mathbf{E} = 0$。代入法拉第定律 $z$ 分量得泊松方程：

$$\Delta \Phi = -\frac{\partial B_z}{\partial t} = -i\Omega_M B_0 e^{i(\Omega_M t - 2\theta)}$$

求解得特解（精确解）：

$$E_r = -\frac{\Omega_M B_0}{2} r \ln\left(\frac{r}{R}\right) e^{-i2\theta}$$

#### 洛伦兹力与驱动扭矩

电流密度 $\mathbf{J} = \sigma \mathbf{E}$。洛伦兹力密度 $\mathbf{f}_L = \mathbf{J} \times \mathbf{B}$，切向分量：

$$f_{L\theta} = \sigma E_r B_z^* \propto -\sigma \Omega_M B_0^2 r \ln\left(\frac{r}{R}\right)$$

扭矩积分（含时间平均系数）：

$$T_z = \int_0^{2\pi} \int_0^R r \cdot f_{L\theta} \cdot r \, dr \, d\theta \cdot d$$

最终得到**驱动扭矩公式**：

$$T_z \approx \sigma d B^2 R^4 (\Omega_M - \Omega_D)$$

其中 $\Omega_D$ 为探针实际角速度。扭矩与相对转速差成正比。

### 2.3 粘性阻力矩推导

探针盘（半径 $R$）与基座磁铁上表面之间的间隙（高度 $h$）内充满待测气体。因 $h \ll R$，可近似为平行平板间的 Couette 流动。

速度分布（$z=0$ 处静止，$z=h$ 处以 $r\Omega_D$ 运动）：

$$v_\theta(r, z) = r\Omega_D \cdot \frac{z}{h}$$

切应力（牛顿流体）：

$$\tau_{z\theta} = \eta \frac{\partial v_\theta}{\partial z} = \eta \frac{r\Omega_D}{h}$$

粘性阻力矩：

$$T_v = \int_0^{2\pi} \int_0^R (-r) \cdot \tau_{z\theta} \cdot r \, dr \, d\theta = -\frac{\pi}{2} \frac{\eta R^4 \Omega_D}{h}$$

形式上写为**粘性阻力矩公式**（比例关系，常数因子吸收到标定系数中）：

$$T_v \approx -\frac{\eta R^4 \Omega_D}{h}$$

### 2.4 电磁制动扭矩（对称性分析）

基座磁铁为轴对称永磁体，其磁场具有完全的旋转对称性。在完全轴对称磁场中，旋转的铝盘不会受到净电磁制动扭矩。数学上，轴对称磁场只有 $B_\rho(\rho, z)$ 和 $B_z(\rho, z)$ 分量，不依赖于方位角 $\phi$。对旋转盘运用法拉第定律，感应电场的周向积分为零，因而净涡流不产生阻力矩。

实际装置采用两个径向充磁磁铁嵌套结构，进一步增强磁场轴对称性，**使电磁制动扭矩 $T_e \approx 0$**。

### 2.5 稳态力矩平衡与粘度公式

稳态旋转时（$\dot{\Omega}_D = 0$），力矩平衡方程：

$$T_z + T_v + T_e = 0$$

代入各扭矩表达式并取 $T_e \approx 0$：

$$\sigma d B^2 R^4 (\Omega_M - \Omega_D) - \frac{\eta R^4 \Omega_D}{h} = 0$$

解得转速比与粘度的关系：

$$\frac{\Omega_M}{\Omega_D} = 1 + \frac{\eta}{\sigma d B^2 h}$$

即：

$$\eta = \sigma d B^2 h \cdot \left(\frac{\Omega_M}{\Omega_D} - 1\right)$$

实验中使用**线性经验标定公式**：

$$\eta = \alpha \cdot R + \beta$$

其中 $R = \Omega_M / \Omega_D$ 为转速比，$\alpha$、$\beta$ 为标定系数。通过测量 1-2 种已知粘度的标准气体（如空气 $\eta \approx 18.5$ $\mu$Pa·s、氮气）确定 $\alpha$、$\beta$，然后测量未知气体。

---

## 3. 转速跟踪算法

### 3.1 整体流程

视频逐帧处理流程：`读取帧 → 转灰度 → 极坐标映射 → 黑线角度检测 → RPM计算 → 写入CSV`

### 3.2 椭圆ROI与极坐标映射

用户在视频第一帧上用矩形框选探针区域，系统自动转换为椭圆参数：
- 中心 $(cx, cy)$ = 矩形中心
- 半长轴 $a$、半短轴 $b$ = 矩形宽高的一半

极坐标映射生成查找表（${NUM\_ANGULAR}=360$，${NUM\_RADIAL}=120$）：

```python
angles = linspace(0, 2π, 360)
fracs = linspace(0, 1, 120)
map_x = cx + fracs * a * cos(angles)
map_y = cy + fracs * b * sin(angles)
```

用 `cv2.remap()` 将椭圆区域展开为 120×360 的极坐标图像。水平轴 = 角度（0-360°），垂直轴 = 径向距离。

### 3.3 黑线角度检测（亚像素精度）

对极坐标图像的 ROI 区域（径向 35%-90%，避免边缘干扰）：

1. **径向平均**：沿垂直方向取每列（每个角度）的平均灰度值，得到 360 点的一维信号
2. **高斯平滑**：对信号做圆形高斯平滑（$\sigma=3$，窗口半宽=4），抑制噪声
3. **最小值定位**：找到信号最小值对应角度（黑线为暗色，对应灰度最低）
4. **抛物亚像素精化**：利用最小值点及左右邻点的灰度值进行抛物线插值：

$$\text{offset} = \frac{I_{\text{left}} - I_{\text{right}}}{2(I_{\text{left}} + I_{\text{right}} - 2I_{\text{center}})}$$

   offset 限制在 $[-0.5, 0.5]$ 范围内。最终角度：

$$\text{angle} = \frac{(\text{idx} + \text{offset}) \times 360}{360} \bmod 360$$

5. **置信度计算**：$\text{confidence} = \frac{\text{median} - \text{min}}{\text{median}}$，反映黑线与背景的对比度

### 3.4 RPM 计算方法（三种互补）

#### 方法1：帧间瞬时 RPM

利用相邻两帧的角度差和时间差：

$$\omega = \frac{\Delta\theta}{\Delta t} \times \frac{\pi}{180}, \quad \text{RPM} = \frac{\Delta\theta}{360} \times \frac{60}{\Delta t}$$

角度差需处理 0°/360° 跨越（若 $|\Delta\theta| > 180°$，则补 $360°$）。

#### 方法2：一圈滑动平均 RPM

对最近 $W$ 帧的瞬时 RPM 值取滑动平均，平滑随机噪声：

$$W = \text{round}\left(\frac{60}{\text{RPM}} \times \text{FPS}\right)$$

窗口大小动态调整 = 一整圈对应的帧数。限制范围 [10, 200]。这是默认显示的 RPM 值。

#### 方法3：过零检测 RPM

检测角度跨越 360°→0° 的时刻（正向跨零）或 0°→360°（反向），累计转数，计算与前一次过零的时间差：

$$\text{RPM} = \frac{60}{T_{\text{period}}}$$

适合检测稳定转速，低速时更准确。

### 3.5 低置信度处理

当 $\text{confidence} < 0.10$ 时（黑线模糊、光照不佳），使用速度预测代替实际检测：

1. 取最近两帧的角度-时间对 $(a_1, t_1)$、$(a_2, t_2)$
2. 计算角速度：$\omega = (a_2 - a_1) / (t_2 - t_1)$
3. 预测当前角度：$a_{\text{pred}} = a_2 + \omega \times (t - t_2)$

此机制保证跟踪不因偶尔的检测失败而中断。

---

## 4. 数据拟合

### 4.1 物理模型

实验预期关系：粘度 $\eta$ 与转速比 $\Omega_M/\Omega_D$ 成线性关系，首选模型为 **$y = ax + b$**。

### 4.2 可用拟合模型

| 模型 | 公式 | 参数 | 物理含义 |
|------|------|------|----------|
| linear | $y = ax + b$ | $a, b$ | **首选**：粘度-转速比线性关系 |
| linear_zero | $y = kx$ | $k$ | 过原点简化模型 |
| quadratic | $y = ax^2 + bx + c$ | $a, b, c$ | 存在非线性修正项时 |
| exponential | $y = a e^{bx}$ | $a, b$ | 非牛顿流体或特殊流态 |
| logarithmic | $y = a \ln x + b$ | $a, b$ | 特定流变行为 |
| reciprocal | $y = k/x + b$ | $k, b$ | 反比关系辅助分析 |

### 4.3 拟合方法

使用 `scipy.optimize.curve_fit`（Levenberg-Marquardt 算法）进行非线性最小二乘拟合。评估指标：

- **$R^2$**（决定系数）：越接近 1 线性越好
- **RMSE**（均方根误差）：越小精度越高
- **标准误差**：各参数的不确定度

---

## 5. CSV 数据格式

跟踪结果 CSV 包含以下列：

| 列名 | 说明 | 单位 |
|------|------|------|
| frame | 帧序号 | — |
| time_s | 视频时间 | 秒 |
| angle_deg | 黑线角度 | 度（0-360） |
| rpm_smooth | 滑动平均 RPM | 转/分钟 |
| rpm_cross | 过零检测 RPM | 转/分钟 |
| confidence | 检测置信度 | 0-1 |

---

## 6. 标定流程

1. 对已知粘度的标准气体（如干燥空气，$\eta \approx 18.5$ $\mu$Pa·s @ 20°C）测量
2. 在不同驱动转速 $\Omega_M$ 下记录探针稳定转速 $\Omega_D$
3. 绘制 $\eta$ vs $\Omega_M/\Omega_D$ 散点图
4. 线性拟合得 $\alpha$、$\beta$ 标定系数
5. 对未知气体，测 $\Omega_M/\Omega_D$，代入标定公式求 $\eta$

---

## 7. 常见问题与解决

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 探针无法悬浮 | HOPG 距离磁铁太远或太近 | 调整初始高度，找到稳定悬浮点 |
| 探针跳动 | 磁场不均匀/气流干扰 | 检查磁铁对称性，等待气流稳定 |
| RPM 波动大 | 光照变化、黑线模糊 | 改善照明，重新标记黑线 |
| 置信度持续低 | ROI 选择不当 | 框选包含完整黑线轨迹的区域 |
| 跟踪丢失 | 黑线超出 ROI | 增大 ROI 范围，确保黑线始终在框内 |
| 拟合 $R^2$ 低 | 存在非线性效应 | 检查数据中是否有异常点，尝试二次模型 |
| 视频帧率不足 | FPS 太低，角度跳变 > 180° | 使用 60+ fps 拍摄，降低驱动转速 |

---

## 8. 注意事项

- **转速比范围**：$\Omega_M/\Omega_D$ 通常在 2-10 之间，超出此范围应检查测量
- **温度影响**：气体粘度随温度变化显著（$T^{3/2}$ 量级），需记录实验温度
- **压力范围**：装置在常压附近测量效果最佳，极低压需考虑分子流效应
- **探针清洁**：HOPG 表面污染会影响抗磁性能，使用前用胶带剥离清洁
- **磁场安全**：NdFeB 强磁铁吸引铁磁物体，操作时远离手表、手机等

---

## 9. 参考文献

[1] Y. Shimokawa, Y. Matsuura, T. Hirano, and K. Sakai, "Gas viscosity measurement with diamagnetic-levitation viscometer based on electromagnetically spinning system," *Review of Scientific Instruments*, vol. 87, no. 12, 125105, 2016. doi:10.1063/1.4968026

[2] K. Sakai, T. Hirano, and M. Hosoda, "Electromagnetically spinning viscometer," *Applied Physics Express*, vol. 3, 016602, 2010.

[3] K. Sakai, T. Hirano, and M. Hosoda, "Analysis of the electromagnetically spinning viscometer," *Applied Physics Express*, vol. 5, 036601, 2012.

[4] M. Hosoda, T. Hirano, and K. Sakai, "Viscosity measurement of Newtonian and non-Newtonian fluids using the electromagnetically spinning viscometer," *Japanese Journal of Applied Physics*, vol. 51, 07GA05, 2012.

[5] M. D. Simon and A. K. Geim, "Diamagnetic levitation: Flying frogs and floating magnets," *Journal of Applied Physics*, vol. 87, no. 9, pp. 6200-6204, 2000.

[6] P. Stamenov and J. M. D. Coey, "Permanent magnetic levitation and diamagnetic suspensions," *Journal of Magnetism and Magnetic Materials*, vol. 290-291, pp. 279-281, 2005.

[7] J. Kestin and W. Leidenfrost, "An absolute determination of the viscosity of eleven gases over a range of pressures," *Physica*, vol. 25, pp. 1033-1062, 1959.

[8] B. E. Poling, J. M. Prausnitz, and J. P. O'Connell, *The Properties of Gases and Liquids*, 5th ed., McGraw-Hill, 2007.

[9] J. O. Hirschfelder, C. F. Curtiss, and R. B. Bird, *Molecular Theory of Gases and Liquids*, Wiley, 1954.

[10] C. R. Wilke, "A viscosity equation for gas mixtures," *Journal of Chemical Physics*, vol. 18, pp. 517-519, 1950.
