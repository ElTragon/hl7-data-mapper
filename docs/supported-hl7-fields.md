# Supported HL7 v2.5.1 Fields

## Interpretation

This matrix defines the HL7 Data Mapper MVP application profile for
`OML^O21^OML_O21`.

“MVP required” describes this product profile, not the base HL7 standard.
Fields not listed here may be parsed structurally in later phases but are not
part of the default normalized output.

## Message and sender

| Target                                    | HL7 source | Type | MVP required | Default behavior     |
| ----------------------------------------- | ---------- | ---- | ------------ | -------------------- |
| `sender.application.namespaceId`          | MSH-3.1    | HD   | Yes          | Trim                 |
| `sender.facility.namespaceId`             | MSH-4.1    | HD   | Yes          | Trim                 |
| `sender.receivingApplication.namespaceId` | MSH-5.1    | HD   | No           | Trim                 |
| `sender.receivingFacility.namespaceId`    | MSH-6.1    | HD   | No           | Trim                 |
| `message.sentAt`                          | MSH-7.1    | TS   | Yes          | Convert to ISO 8601  |
| `message.type`                            | MSH-9.1    | MSG  | Yes          | Must equal `OML`     |
| `message.triggerEvent`                    | MSH-9.2    | MSG  | Yes          | Must equal `O21`     |
| `message.structure`                       | MSH-9.3    | MSG  | Yes          | Must equal `OML_O21` |
| `message.controlId`                       | MSH-10     | ST   | Yes          | Trim                 |
| `message.processingId`                    | MSH-11.1   | PT   | Yes          | Preserve code        |
| `message.version`                         | MSH-12.1   | VID  | Yes          | Must equal `2.5.1`   |

## Patient

| Target                                     | HL7 source | Type    | MVP required | Default behavior                    |
| ------------------------------------------ | ---------- | ------- | ------------ | ----------------------------------- |
| `patient.identifiers[].value`              | PID-3.1    | CX      | Yes          | Prefer repetition with PID-3.5=`MR` |
| `patient.identifiers[].assigningAuthority` | PID-3.4.1  | CX/HD   | No           | Preserve namespace ID               |
| `patient.identifiers[].type`               | PID-3.5    | CX      | No           | Preserve code                       |
| `patient.name.family`                      | PID-5.1    | XPN     | Yes          | First repetition, trim              |
| `patient.name.given`                       | PID-5.2    | XPN     | Yes          | First repetition, trim              |
| `patient.name.middle`                      | PID-5.3    | XPN     | No           | Empty becomes `null`                |
| `patient.name.suffix`                      | PID-5.4    | XPN     | No           | Empty becomes `null`                |
| `patient.name.prefix`                      | PID-5.5    | XPN     | No           | Empty becomes `null`                |
| `patient.dateOfBirth`                      | PID-7.1    | TS      | Yes          | Convert to `YYYY-MM-DD`             |
| `patient.administrativeSex`                | PID-8      | IS      | No           | Preserve code                       |
| `patient.addresses[].street`               | PID-11.1.1 | XAD/SAD | No           | Preserve repetitions                |
| `patient.addresses[].city`                 | PID-11.3   | XAD     | No           | Trim                                |
| `patient.addresses[].state`                | PID-11.4   | XAD     | No           | Trim                                |
| `patient.addresses[].postalCode`           | PID-11.5   | XAD     | No           | Trim                                |
| `patient.addresses[].country`              | PID-11.6   | XAD     | No           | Trim                                |
| `patient.telecom[].use`                    | PID-13.2   | XTN     | No           | Preserve code                       |
| `patient.telecom[].equipmentType`          | PID-13.3   | XTN     | No           | Preserve code                       |
| `patient.telecom[].countryCode`            | PID-13.5   | XTN     | No           | Empty becomes `null`                |
| `patient.telecom[].areaCode`               | PID-13.6   | XTN     | No           | Trim                                |
| `patient.telecom[].localNumber`            | PID-13.7   | XTN     | No           | Trim                                |

## Coverage

Every IN1 in the patient group creates one `coverages[]` entry.

| Target                                        | HL7 source | Type | MVP required        | Default behavior     |
| --------------------------------------------- | ---------- | ---- | ------------------- | -------------------- |
| `coverages[].sequence`                        | IN1-1      | SI   | Yes when IN1 exists | Convert to integer   |
| `coverages[].plan.code`                       | IN1-2.1    | CE   | No                  | Trim                 |
| `coverages[].plan.display`                    | IN1-2.2    | CE   | No                  | Trim                 |
| `coverages[].plan.system`                     | IN1-2.3    | CE   | No                  | Trim                 |
| `coverages[].insurer.id`                      | IN1-3.1    | CX   | No                  | First repetition     |
| `coverages[].insurer.name`                    | IN1-4.1    | XON  | No                  | First repetition     |
| `coverages[].groupNumber`                     | IN1-8      | ST   | No                  | Trim                 |
| `coverages[].subscriber.name.family`          | IN1-16.1   | XPN  | No                  | First repetition     |
| `coverages[].subscriber.name.given`           | IN1-16.2   | XPN  | No                  | First repetition     |
| `coverages[].subscriber.name.middle`          | IN1-16.3   | XPN  | No                  | Empty becomes `null` |
| `coverages[].subscriber.relationship.code`    | IN1-17.1   | CE   | No                  | Preserve code        |
| `coverages[].subscriber.relationship.display` | IN1-17.2   | CE   | No                  | Preserve text        |
| `coverages[].policyNumber`                    | IN1-36     | ST   | No                  | Trim                 |

## Guarantor

OML_O21 permits one optional GT1 in the patient group. If GT1 is absent,
`guarantor` is `null`.

| Target                                    | HL7 source | Type    | MVP required        | Default behavior        |
| ----------------------------------------- | ---------- | ------- | ------------------- | ----------------------- |
| `guarantor.identifier.value`              | GT1-2.1    | CX      | No                  | Trim                    |
| `guarantor.identifier.assigningAuthority` | GT1-2.4.1  | CX/HD   | No                  | Preserve namespace ID   |
| `guarantor.identifier.type`               | GT1-2.5    | CX      | No                  | Preserve code           |
| `guarantor.name.family`                   | GT1-3.1    | XPN     | Yes when GT1 exists | First repetition        |
| `guarantor.name.given`                    | GT1-3.2    | XPN     | No                  | First repetition        |
| `guarantor.name.middle`                   | GT1-3.3    | XPN     | No                  | Empty becomes `null`    |
| `guarantor.address.street`                | GT1-5.1.1  | XAD/SAD | No                  | First repetition        |
| `guarantor.address.city`                  | GT1-5.3    | XAD     | No                  | Trim                    |
| `guarantor.address.state`                 | GT1-5.4    | XAD     | No                  | Trim                    |
| `guarantor.address.postalCode`            | GT1-5.5    | XAD     | No                  | Trim                    |
| `guarantor.address.country`               | GT1-5.6    | XAD     | No                  | Trim                    |
| `guarantor.telecom.use`                   | GT1-6.2    | XTN     | No                  | First repetition        |
| `guarantor.telecom.equipmentType`         | GT1-6.3    | XTN     | No                  | Preserve code           |
| `guarantor.telecom.areaCode`              | GT1-6.6    | XTN     | No                  | Trim                    |
| `guarantor.telecom.localNumber`           | GT1-6.7    | XTN     | No                  | Trim                    |
| `guarantor.dateOfBirth`                   | GT1-8.1    | TS      | No                  | Convert to `YYYY-MM-DD` |
| `guarantor.administrativeSex`             | GT1-9      | IS      | No                  | Preserve code           |
| `guarantor.type`                          | GT1-10     | IS      | No                  | Preserve code           |
| `guarantor.relationship.code`             | GT1-11.1   | CE      | No                  | Preserve code           |
| `guarantor.relationship.display`          | GT1-11.2   | CE      | No                  | Preserve text           |

## Laboratory orders

Each ORC starts one `labOrders[]` entry. TQ1, OBR, and SPM segments are bound to
the current ORC group until the next ORC.

| Target                                      | HL7 source              | Type | MVP required | Default behavior      |
| ------------------------------------------- | ----------------------- | ---- | ------------ | --------------------- |
| `labOrders[].controlCode`                   | ORC-1                   | ID   | Yes          | Preserve code         |
| `labOrders[].placerOrderNumber.value`       | OBR-2.1, then ORC-2.1   | EI   | Yes          | OBR with ORC fallback |
| `labOrders[].placerOrderNumber.namespaceId` | OBR-2.2, then ORC-2.2   | EI   | No           | OBR with ORC fallback |
| `labOrders[].fillerOrderNumber.value`       | OBR-3.1, then ORC-3.1   | EI   | No           | OBR with ORC fallback |
| `labOrders[].fillerOrderNumber.namespaceId` | OBR-3.2, then ORC-3.2   | EI   | No           | OBR with ORC fallback |
| `labOrders[].status`                        | ORC-5                   | ID   | No           | Preserve code         |
| `labOrders[].transactionAt`                 | ORC-9.1                 | TS   | No           | Convert to ISO 8601   |
| `labOrders[].orderingProvider.id`           | ORC-12.1, then OBR-16.1 | XCN  | No           | ORC with OBR fallback |
| `labOrders[].orderingProvider.family`       | ORC-12.2, then OBR-16.2 | XCN  | No           | ORC with OBR fallback |
| `labOrders[].orderingProvider.given`        | ORC-12.3, then OBR-16.3 | XCN  | No           | ORC with OBR fallback |
| `labOrders[].timing.startAt`                | TQ1-7.1                 | TS   | No           | First TQ1, ISO 8601   |
| `labOrders[].timing.endAt`                  | TQ1-8.1                 | TS   | No           | First TQ1, ISO 8601   |
| `labOrders[].timing.priority.code`          | TQ1-9.1                 | CWE  | No           | Preserve code         |
| `labOrders[].timing.priority.display`       | TQ1-9.2                 | CWE  | No           | Preserve text         |
| `labOrders[].service.code`                  | OBR-4.1                 | CE   | Yes          | Trim                  |
| `labOrders[].service.display`               | OBR-4.2                 | CE   | No           | Trim                  |
| `labOrders[].service.system`                | OBR-4.3                 | CE   | No           | Preserve code system  |

OBR-7 is not used as the requested start time. The MVP uses TQ1-7 because
OBR-7 represents observation/specimen timing rather than the requested order
schedule.

## Specimens

Every SPM inside an order creates one `labOrders[].specimens[]` entry.

| Target                              | HL7 source | Type   | MVP required        | Default behavior       |
| ----------------------------------- | ---------- | ------ | ------------------- | ---------------------- |
| `specimens[].sequence`              | SPM-1      | SI     | Yes when SPM exists | Convert to integer     |
| `specimens[].placerId.value`        | SPM-2.1.1  | EIP/EI | No                  | Trim                   |
| `specimens[].placerId.namespaceId`  | SPM-2.1.2  | EIP/EI | No                  | Trim                   |
| `specimens[].fillerId.value`        | SPM-2.2.1  | EIP/EI | No                  | Trim                   |
| `specimens[].fillerId.namespaceId`  | SPM-2.2.2  | EIP/EI | No                  | Trim                   |
| `specimens[].type.code`             | SPM-4.1    | CWE    | Yes when SPM exists | Preserve code          |
| `specimens[].type.display`          | SPM-4.2    | CWE    | No                  | Preserve text          |
| `specimens[].type.system`           | SPM-4.3    | CWE    | No                  | Preserve coding system |
| `specimens[].role.code`             | SPM-11.1   | CWE    | No                  | Preserve code          |
| `specimens[].role.display`          | SPM-11.2   | CWE    | No                  | Preserve text          |
| `specimens[].collected.startAt`     | SPM-17.1   | DR/TS  | No                  | Convert to ISO 8601    |
| `specimens[].collected.endAt`       | SPM-17.2   | DR/TS  | No                  | Convert to ISO 8601    |
| `specimens[].receivedAt`            | SPM-18.1   | TS     | No                  | Convert to ISO 8601    |
| `specimens[].containerType.code`    | SPM-27.1   | CWE    | No                  | Preserve code          |
| `specimens[].containerType.display` | SPM-27.2   | CWE    | No                  | Preserve text          |
| `specimens[].containerType.system`  | SPM-27.3   | CWE    | No                  | Preserve coding system |

## Repetitions and unknown segments

- `~` separates field repetitions.
- `^` separates components.
- `&` separates subcomponents.
- The default profile uses semantic selectors where documented, such as
  PID-3.5=`MR`, rather than assuming the first repetition is always correct.
- Unknown standard segments and local `Z` segments are preserved in the parsed
  message but ignored by the default normalized output.
- A client profile may reference a local segment only through an explicit
  `hl7Item`; the application never guesses its meaning.

## References

- [OML_O21 structure in HL7 v2.5.1 Chapter 4](https://www.hl7.eu/HL7v2x/v251/std251/ch04.html)
- [PID fields in HL7 v2.5.1 Chapter 3](https://www.hl7.eu/HL7v2x/v251/std251/ch03.html)
- [IN1 and GT1 fields in HL7 v2.5.1 Chapter 6](https://www.hl7.eu/HL7v2x/v251/std251/ch06.html)
- [OBR and SPM fields in HL7 v2.5.1 Chapter 7](https://www.hl7.eu/HL7v2x/v251/std251/ch07.html)
