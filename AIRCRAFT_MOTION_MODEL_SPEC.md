# Aircraft Motion Model Spec

## Scope

This simulator uses a radar-level kinematic model. It is designed to feel plausible for Jeju APP training, not to reproduce certified aircraft performance.

## Current Rules

- Each radar tick advances aircraft state by 3 simulated seconds.
- Simulation speed can be set to `1x / 2x / 4x / 6x / 8x / 10x`.
- Clearance state is written immediately: DCT/STAR/SID/ILS appears in aircraft state and scratchpad right away.
- Controller-issued values in `assigned` are protected clearance state. Automation must not rewrite them.
- Aircraft automation writes internal `execution_*` targets when it needs to hold, cap, or sequence a maneuver.
- Actual maneuver starts after command delay from `data/reference/command_delay_profiles.json`.
- Heading changes use live bank state. The aircraft rolls into bank, turns at a bank/speed-limited rate, and rolls out/captures the assigned heading.
- Turn rate is based on current radar ground speed and bank angle, capped by `max_turn_rate_deg_sec`.
- Controller SPD is treated as indicated airspeed (`IAS/KIAS`).
- Radar movement starts from IAS-derived true airspeed and applies configured wind layers when wind is enabled.
- Route-tracking aircraft correct heading for wind to hold the target track. Headwind/tailwind changes ground speed and therefore ETA to fixes.
- Speed changes are linear toward assigned IAS, then modified by flight state.
- Approach deceleration is slightly stronger than generic deceleration.
- Climb acceleration is damped because energy is being used for climb.
- High-altitude acceleration is damped further because excess thrust margin is lower.
- Altitude changes use assigned vertical speed if one exists; otherwise the aircraft uses the profile climb/descent rate toward assigned altitude.
- Altitude capture tapers vertical speed near assigned altitude, then stops vertical speed inside the profile capture band.
- Even while an ALT command is still pending under command delay, the aircraft must not cross the newly assigned altitude with an old vertical rate. If the old vertical rate would cross the assigned altitude, the model captures the assigned altitude and zeros VS; if already beyond it and moving farther away, it holds current altitude.
- Procedure guidance keeps recalculating assigned heading toward the active target fix after the command delay expires.
- Procedure route guidance does not turn early before the active fix. When the active fix is captured, the aircraft position snaps to that fix, route target advances, and actual heading blends toward the next leg for 6 simulated seconds.
- ILS APP guidance can override altitude/speed assignment with approach-profile targets for the active runway final approach.
- ILS final guidance tracks a moving lead point on the final centerline instead of only pointing directly at the runway threshold.
- ILS/APP vertical guidance must not skip ahead to the next crossing altitude before the active APP fix is captured. Example: while `YUMIN` is active, `LIMSO 2900` is blocked; while `DUKAL` is active, `TOKIN 2900` is blocked.
- Managed flight profile rules are loaded from `data/reference/rkpc_flight_profiles.json`.
- Managed vertical profile rules are loaded from `data/reference/rkpc_vertical_profiles.json`.
- Arrival/approach procedure speed values are maximum restrictions. They reduce internal execution speed when needed, but do not rewrite controller speed clearance or command acceleration after `RESUME NORMAL SPEED`.
- Procedure speed restrictions apply only while `route_mode=procedure`. Direct-to-fix is coordinate guidance only and does not inherit STAR/ILS speed restrictions from the target fix.
- Canceled procedure speed restrictions are excluded from managed speed selection, including speed restrictions carried forward from a prior STAR fix.

## Managed Speed And Resume Normal

Speed control now separates controller speed from managed/procedure speed:

- `speed_control_mode=controller`: controller-entered SPD is active.
- `speed_control_mode=managed`: simulator profile or procedure restriction is driving speed.
- `speed_control_mode=released`: controller SPD has been released by `RESUME NORMAL SPEED`.
- `controller_assigned_speed_kt`: last direct controller SPD assignment.
- `managed_speed_kt`: current profile/procedure maximum speed, when applicable.
- `execution_speed_kt`: internal aircraft speed target after profile, gate, or procedure limits. Data block/controller clearance still comes from `assigned`.

Arrival behavior:

- `RESUME NORMAL SPEED` releases the controller SPD assignment.
- It does not increase speed back to 250 kt or to approach segment defaults.
- The aircraft keeps approximately the current IAS until a lower managed/procedure restriction applies internally.
- Example: APP at 8000 ft, SPD 230, then RES SPD -> target remains near 230, not 250.
- Example: STAR at 240 kt, then RES SPD -> remains near 240 until MANBA max 220 kt, then decelerates.
- Example: final/minimum speed 140 kt, then RES SPD -> does not accelerate back to 160 kt.
- Example: DCT YUMIN or DCT RW070 does not apply YUMIN/RW070 procedure speed limits unless STAR/ILS has actually been assigned.

Departure behavior:

- DEP `RESUME NORMAL SPEED` returns to the departure climb speed schedule.
- Below or at 10000 ft: 250 kt.
- Above 10000 ft: 300 kt.

Arrival speed gate:

- If an arrival is above 10000 ft, assigned below 10000 ft, and IAS is above 250 kt, the simulator holds the internal execution altitude at 10000 ft.
- The controller/display altitude in `assigned.altitude_ft` is not changed.
- The original lower assigned altitude is stored in `pending_descent_altitude_ft`.
- Once IAS is at or below the gate release speed, the internal 10000 ft hold is cleared and descent continues toward the original controller-assigned altitude.
- In `DES VIA`, this gate is applied before STAR altitude capture. Example: if PC726 requires 9000 ft but the aircraft is still fast above 10000 ft, the active target becomes A100/250 first, while PC726 9000 remains pending.

## Managed Vertical Profile

Vertical control now separates controller vertical instructions from procedure-managed constraints:

- `altitude_control_mode=controller`: controller-entered ALT is active and STAR/ILS vertical automation does not override it.
- `vertical_rate_control_mode=controller`: controller-entered VS is active and STAR/ILS vertical automation does not override it.
- `altitude_control_mode=managed` and `vertical_rate_control_mode=managed`: the simulator may use AIP-derived procedure constraints.
- `vertical_procedure_mode=cancel_level`: route and speed restrictions remain active, but STAR altitude restrictions do not command descent. This is the default for STAR assignment.
- `vertical_procedure_mode=des_via`: STAR altitude and speed restrictions are both followed from the remaining active route.
- `vertical_procedure_mode=approach`: ILS approach profile is active. IAF/IF/FAF crossing altitudes are treated as descent/capture targets only when the aircraft is above them.
- `vertical_procedure_mode=controller`: explicit HDG/ALT/VS style controller instruction owns the vertical state.
- SID aircraft do not use `DES VIA`; SID fix constraints are applied while `procedure_kind=SID`, `route_mode=procedure`, and altitude/vertical-rate modes are managed.
- `managed_altitude_constraint_fix`: the current fix driving the managed vertical target.
- `managed_altitude_constraint_ft`: altitude being protected or captured.
- `managed_vertical_rate_fpm`: computed vertical rate for the active constraint.
- `execution_altitude_ft` and `execution_vertical_rate_fpm`: internal vertical targets used for speed gates, DES VIA, and ILS APP profile. They do not replace `assigned.altitude_ft` or `assigned.vertical_rate_fpm`.

Constraint rules:

- `at`: capture the published altitude only when the aircraft is above that altitude. It does not command climb by itself.
- `at_or_below`: descend only if currently above the maximum altitude.
- STAR `at_or_above`: minimum altitude protection only. It does not command descent or climb by itself.
- SID `at`: climb toward the published altitude, but do not descend back if already above it.
- SID `at_or_below`: protect a climb cap before the fix.
- SID `at_or_above`: climb toward the required minimum altitude before the fix.
- SID `window`: climb to the lower bound when below the window, then protect the upper bound.
- SID managed climb is capped by the aircraft performance profile. Normal B738/A320-class SID climb uses `climb_fpm`; `EXPEDITE CLIMB` may use `expedite_climb_fpm`; `INCREASE RATE OF CLIMB` may add the configured increase step, never above the vertical profile cap.
- If a SID climb also needs acceleration, the planner reserves climb performance for speed-up using `climb_acceleration_vertical_penalty_fpm_per_kt_sec`.
- Published SID climb-gradient constraints are converted from percent to ft/NM and checked against aircraft capability at planning ground speed. Example: 6.8% is about 413 ft/NM. If the aircraft can meet the altitude fix but cannot meet the published gradient at the current speed/wind/performance cap, guidance status becomes `UNABLE`.
- APP/ILS profile crossing altitudes are descent/capture targets only from above. If the aircraft is already below a crossing altitude, the simulator must not climb without a controller ALT/VS instruction.
- `window`: protect the min/max window when both bounds are available.
- Required vertical rate is calculated from current position to the constraint fix along the remaining route.
- If required descent is below the minimum descent rate, the aircraft holds current altitude until closer to the constraint. This avoids an unrealistically early shallow descent.
- If a `DES VIA` target is below 10000 ft and IAS is still above the 250 kt gate, managed vertical guidance first targets internal execution altitude 10000 ft and internal execution speed 250 kt. The displayed controller altitude is preserved.

## Radar Sweep And Simulation Speed

Each radar tick always advances aircraft state by 3 simulated seconds. Simulation speed shortens the real browser timer that triggers the next tick:

| Selected speed | Real tick interval | Simulated time per tick |
|---:|---:|---:|
| `1x` | 3.0 sec | 3 sec |
| `2x` | 1.5 sec | 3 sec |
| `4x` | 0.75 sec | 3 sec |
| `6x` | 0.5 sec | 3 sec |
| `8x` | 0.375 sec | 3 sec |
| `10x` | 0.3 sec | 3 sec |

This keeps the radar-tick movement model but reduces visible jumpiness at high speed. Route progression, command delay, departure takeoff roll, arrival streams, departure waves, speed changes, altitude changes, and turn model all use the advanced simulation clock.

This is not an internal substep multiplier. At `10x`, the aircraft is not advanced 30 seconds in one draw; it is advanced by 3 seconds every 0.3 real seconds.

## Motion State Fields

Aircraft state now distinguishes controller speed and radar movement speed:

- `indicated_speed_kt`: internal IAS/KIAS used for controller SPD commands.
- `ground_speed_kt`: radar movement speed after IAS-to-TAS conversion and active wind effect. With wind disabled, this is the no-wind IAS-derived movement speed.
- `turn_state.bank_deg`: internal live bank angle used during roll-in/roll-out.
- `turn_state.target_heading_true_deg`: active target heading in true degrees.
- `turn_state.direction`: left/right turn direction.

Wind-enabled route tracking uses the wind-corrected ground speed for position update and for guidance planning. Headwind increases time to the active fix and lowers the required vertical rate for a crossing; tailwind reduces time and raises the required vertical rate.

## Departure Takeoff Roll And Climb Profile

Manual `DEP` creation and `DEP WAVE` use the same runway departure profile.

Initial runway roll state:

- Spawn position: selected runway threshold.
- Initial altitude: `0 ft` (`A000`).
- Initial ground speed: `0 kt`.
- Initial heading: selected runway true bearing.
- Takeoff roll target: opposite runway threshold / departure end.
- Roll acceleration: `5 kt/sec` until `180 kt`.

SID release state:

- At the departure end, the aircraft is fixed at `1000 ft` (`A010`) and at least `180 kt`.
- Initial vertical rate after SID release: default `2200 fpm`, editable through `VS`.
- Route mode remains `procedure`, but SID fix guidance starts only after the roll release.
- Initial route: selected exit fix's matching SID. If no RNAV SID is available, the conventional fallback route is used.
- Initial assigned altitude: `10000 ft` (`A100`).
- Initial assigned speed: `250 kt`.

Speed automation:

- Departure aircraft without an explicit controller SPD instruction use automatic speed targets.
- At or below `10000 ft`, automatic target speed is `250 kt`.
- Above `10000 ft`, automatic target speed becomes `300 kt`.
- If the controller enters a SPD instruction, that assigned speed takes priority over the automatic 250/300 profile.
- These targets are IAS targets. Radar map movement can be higher than the target at altitude.

Altitude automation:

- The aircraft climbs toward assigned altitude using the active vertical rate.
- The default assigned altitude is `10000 ft`.
- If the controller enters a new ALT instruction, the aircraft continues climb/descent toward the newly assigned altitude.

## ILS Approach And Landing Profile

ILS profile v1 is intentionally narrow and only applies when `procedure_kind=APP`.

RWY07:

- Route: `YUMIN -> LIMSO -> RW070`
- `YUMIN`: 4000 ft target
- `LIMSO`: 2900 ft target
- Final segment to `RW070`: target speed 160 kt, runway altitude descent, then landed state
- While capturing `YUMIN -> LIMSO`, the model protects the YUMIN 4000 ft floor; it must not apply the LIMSO 2900 ft target before the IAF crossing is honored.
- Before `LIMSO`, the aircraft keeps tracking `LIMSO`; it does not turn early toward final.
- At `LIMSO` capture, the aircraft is placed on `LIMSO`; during the next two radar sweeps it moves on the `LIMSO -> RW070` centerline while actual heading blends toward final course.

RWY25:

- Route: `DUKAL -> TOKIN -> RW250`
- `DUKAL`: 4000 ft target
- `TOKIN`: 2900 ft target
- Final segment to `RW250`: target speed 160 kt, runway altitude descent, then landed state
- While capturing `DUKAL -> TOKIN`, the model protects the DUKAL 4000 ft floor; it must not apply the TOKIN 2900 ft target before the IAF crossing is honored.
- Before `TOKIN`, the aircraft keeps tracking `TOKIN`; it does not turn early toward final.
- At `TOKIN` capture, the aircraft is placed on `TOKIN`; during the next two radar sweeps it moves on the `TOKIN -> RW250` centerline while actual heading blends toward final course.

The model now has basic localizer lead-point capture after FAF capture and a v1 glideslope-capture-failure trigger. If final ILS guidance is `too_high` and landing feasibility is false inside the missed-approach trigger window, the missed-approach runtime treats it as `glideslope_capture_failure`. It still does not simulate full autopilot mode failures, flare, or rollout. Touchdown is represented by `landing_state=landed`; the UI keeps the aircraft briefly and then removes it from radar traffic.

## Reference Basis

- FAA Airplane Flying Handbook: turn and bank-angle fundamentals.
- EUROCONTROL BADA: real aircraft performance modelling reference; licensed BADA coefficients are not embedded.
- OpenAP Handbook: open aircraft performance modelling reference for future refinement.

## Verification

Run from `jeju-radar-ui`:

- `npm run verify:motion`: validates roll-in heading response, IAS-to-ground-speed altitude conversion, climb/high-altitude acceleration damping, approach deceleration, expedite/increase vertical energy modes, and altitude capture taper.
- `npm run verify:procedures`: validates DCT/STAR/SID/ILS route progression together with the current motion model.
- `npm run verify:vertical-profiles`: validates STAR/ILS managed vertical constraints and ILS moving glide-path altitude.
- `npm run verify:guidance-planner` and `npm run verify:guidance-timeflow`: validate wind-aware required vertical-rate planning, SID climb performance caps, and published climb-gradient feasibility.
- `npm run verify:arrival-streams`: validates arrival stream airway spawn geometry.

## Not Yet Modelled

- Aircraft-specific FCOM/AFM performance tables.
- Full VNAV path constraints for every STAR/SID, speed constraints, exact chart-validated turn anticipation/intercept path construction, and flap/gear phase logic. IPDAS 4K has a training runtime pseudo-fix path, but exact route validation is still pending.
- Random pilot response variability.
